/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    EventFired,
    EventHandler,
    Failure,
    failure,
    GraphQL,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    Secret,
    Secrets,
    Success,
    success,
    Tags,
} from "@atomist/automation-client";
import * as Storage from "@google-cloud/storage";
import * as Github from "@octokit/rest";
import * as appRoot from "app-root-path";
import { exec } from "child-process-promise";
import * as fs from "fs-extra";
import { JWT } from "google-auth-library";
import { google } from "googleapis";
import * as stringify from "json-stringify-safe";
import * as path from "path";
import * as tmp from "tmp-promise";

import { AtomistBuildStatus, postBuildWebhook, postLinkImageWebhook } from "../atomistWebhook";
import { preErrMsg, reduceResults } from "../error";
import { createBuildCommitStatus, kubeBuildContextPrefix } from "../github";
import { buildName, ContainerBuildAuthRequest, googleContainerBuild, imageTag } from "../googleContainerBuilder";
import { GoogleContainerBuilderSub } from "../typings/types";

@EventHandler("use Google Container Builder to build a Docker image for Spring Boot apps",
    GraphQL.subscriptionFromFile("googleContainerBuilder", __dirname))
@Tags("push", "ci", "docker", "spring")
export class GoogleContainerBuilder implements HandleEvent<GoogleContainerBuilderSub.Subscription> {

    @Secret(Secrets.OrgToken)
    private githubToken: string;

    public handle(ev: EventFired<GoogleContainerBuilderSub.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {

        return Promise.all(ev.data.Status.map(s => {

            const branch = eligibleBuildStatus(s);
            if (!branch) {
                logger.info("push is not eligible for GoogleContainerBuilder");
                return Promise.resolve(Success);
            }

            const github = new Github();
            try {
                github.authenticate({
                    type: "token",
                    token: this.githubToken,
                });
            } catch (e) {
                logger.warn("failed to authenticate with GitHub using token, with not perform " +
                    `Google Container builds: ${e.message}`);
                return Promise.resolve(Success);
            }

            let googleCloudKey: Storage.Credentials;
            try {
                // tslint:disable-next-line:no-var-requires
                googleCloudKey = require(path.join(appRoot.path, "..", "creds", "gcb", "ri-ci-1.json"));
            } catch (e) {
                logger.warn("no Google Cloud service account key, will not perform Google Container builds: " +
                    e.message);
                return Promise.resolve(Success);
            }
            const jwtClient = new google.auth.JWT(
                googleCloudKey.client_email,
                null,
                googleCloudKey.private_key,
                ["https://www.googleapis.com/auth/cloud-platform"],
                null,
            );

            return jwtClient.authorize()
                .then(tokens => {
                    return cloneAndBuild(s, branch, jwtClient, github)
                        .catch(e => ({ code: 1, message: e.message }));
                }, e => {
                    logger.warn("failed to authorize with Google Cloud, will not perform Google Container builds: " +
                        e.message);
                    return Success;
                });
        }))
            .then(results => reduceResults(results));
    }
}

/**
 * Make sure event has all the data it needs to build with
 * GoogleContainerBuilder.
 *
 * @param s status event
 * @return branch if eligible, undefined if not
 */
function eligibleBuildStatus(s: GoogleContainerBuilderSub.Status): string {
    if (s.context.indexOf(kubeBuildContextPrefix) !== 0) {
        logger.debug(`${s.commit.repo.org.owner}/${s.commit.repo.name} commit status context '${s.context}' ` +
            `does not start with '${kubeBuildContextPrefix}'`);
        return undefined;
    }
    if (s.state !== "pending") {
        logger.debug(`${s.commit.repo.org.owner}/${s.commit.repo.name} commit status state ${s.state} ` +
            `is not "pending"`);
        return undefined;
    }
    if (s.targetUrl) {
        logger.debug(`${s.commit.repo.org.owner}/${s.commit.repo.name} commit status already has a URL`);
    }
    const branch = s.context.replace(kubeBuildContextPrefix, "");
    return branch;
}

export interface GitHubAuth {
    /** authenticated Github @octokit/rest client */
    github: Github;
}

/**
 * Clone Git repo in temp directory and checkout commit, then call checkAndBuild.
 *
 * @param s status event
 * @param branch build branch
 * @param jwtClient Google Cloud JWT client
 * @param github authenticated Github @octokit/rest client
 * @return handler result
 */
export function cloneAndBuild(
    s: GoogleContainerBuilderSub.Status,
    branch: string,
    jwtClient: JWT,
    github: Github,
): Promise<HandlerResult> {

    const req: ContainerBuildAuthRequest & GitHubAuth = {
        dir: ".",
        owner: s.commit.repo.org.owner,
        repo: s.commit.repo.name,
        branch,
        sha: s.commit.sha,
        teamId: s.commit.repo.org.team.id,
        jwtClient,
        github,
    };
    const buildStr = buildName(req);

    return tmp.dir({ unsafeCleanup: true })
        .catch(e => Promise.reject(preErrMsg(e, `failed to create temp dir for ${buildStr}`)))
        .then(tmpDir => {
            req.dir = path.join(tmpDir.path, req.repo);
            const cloneUrl = `https://github.com/${req.owner}/${req.repo}.git`;
            const cloneCmd = `git clone --quiet --depth 10 --branch ${req.branch} ${cloneUrl} ${req.repo}`;
            return exec(cloneCmd, { cwd: tmpDir.path })
                .then(() => {
                    return exec(`git checkout --quiet --force ${req.sha}`, { cwd: req.dir })
                        .then(() => {
                            return checkAndBuild(req);
                        }, e => {
                            const msg = `failed to check out ${buildStr}, skipping build: ${e.message}`;
                            logger.warn(msg);
                            return { code: 0, message: msg };
                        });
                }, e => {
                    const msg = `failed to clone ${buildStr}, assuming private repo, skipping: ${e.message}`;
                    logger.warn(msg);
                    return { code: 0, message: msg };
                })
                .then(res => {
                    tmpDir.cleanup();
                    return res;
                });
        });
}

/**
 * Ensure the project is a valid sample Spring project then build.
 *
 * @param req project build request
 * @return build status
 */
export function checkAndBuild(req: ContainerBuildAuthRequest & GitHubAuth): Promise<HandlerResult> {
    const buildStr = buildName(req);
    return gcbEligible(req.dir)
        .catch(e => Promise.reject(preErrMsg(e, `failed to check eligibility of project ${buildStr}`)))
        .then(eligible => {
            if (!eligible) {
                const msg = `project ${buildStr} does not meet GCB eligibility`;
                logger.info(msg);
                return { code: 0, message: msg };
            }
            return gcBuild(req)
                .then(status => {
                    if (status === "passed") {
                        return Success;
                    }
                    return { code: 1, message: `project ${buildStr} build status: ${status}` };
                });
        });
}

/**
 * Run through a series of checks to ensure cloned project is worthy
 * of a Google Container Build.
 *
 * @param projectDir local path to cloned repo
 * @return true if eligible
 */
export function gcbEligible(projectDir: string): Promise<boolean> {
    const pomPath = path.join(projectDir, "pom.xml");
    const mvnPath = path.join(projectDir, "mvnw");
    // tslint:disable-next-line:max-line-length
    const springRegExp = /<groupId>org\.springframework\.boot<\/groupId>\s*<artifactId>spring-boot-starter-parent<\/artifactId>/;
    const checks: Array<() => Promise<boolean>> = [
        () => fs.pathExists(pomPath),
        () => fs.pathExists(mvnPath),
        () => fs.readFile(pomPath).then(pom => springRegExp.test(pom.toLocaleString())),
    ];
    return Promise.all(checks.map(f => f()))
        .then(results => results.every(r => r));
}

/**
 * Build the project in projectDir, sending build and link-image webhooks
 * along the way.
 *
 * @param req project build request
 * @return build status
 */
export function gcBuild(req: ContainerBuildAuthRequest & GitHubAuth): Promise<AtomistBuildStatus> {
    const buildStr = buildName(req);
    const context = `${kubeBuildContextPrefix}${req.branch}`;
    const ciSrc = path.join(appRoot.path, "assets", "ci");

    return fs.copy(ciSrc, req.dir)
        .catch(e => Promise.reject(preErrMsg(e, `failed to copy ${ciSrc} to ${req.dir}: ${e.message}`)))
        .then(() => {
            const status = "started";
            postBuildWebhook(req.owner, req.repo, req.branch, req.sha, status, req.teamId);
            logger.debug(`building ${buildStr}`);
            return googleContainerBuild(req);
        })
        .then(res => {
            logger.debug(`${buildStr} build status: ${res.status}`);
            if (res.status === "passed") {
                const image = imageTag(req.owner, req.repo, req.sha);
                postLinkImageWebhook(req.owner, req.repo, req.sha, image, req.teamId);
            }
            postBuildWebhook(req.owner, req.repo, req.branch, req.sha, res.status, req.teamId, res.logUrl);
            createBuildCommitStatus(req.github, req.owner, req.repo, req.sha, res.status, context, res.logUrl);
            return res.status;
        })
        .catch(e => {
            const status = "error";
            postBuildWebhook(req.owner, req.repo, req.branch, req.sha, status, req.teamId);
            createBuildCommitStatus(req.github, req.owner, req.repo, req.sha, status, context);
            return Promise.reject(preErrMsg(e, `build of ${buildStr} in ${req.dir} errored`));
        });
}
