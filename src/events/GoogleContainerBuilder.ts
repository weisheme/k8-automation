/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
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
    Success,
    success,
    Tags,
} from "@atomist/automation-client";

import * as appRoot from "app-root-path";
import { exec } from "child-process-promise";
import * as fs from "fs-extra";
import { google } from "googleapis";
import * as path from "path";
import * as tmp from "tmp-promise";

import { GoogleContainerBuilderSub } from "../typings/types";
import { postBuildWebhook, postLinkImageWebhook } from "./atomistWebhook";
import { gcBuilder } from "./googleCloudBuilder";

@EventHandler("use Google Container Builder to build a Docker image for Spring Boot apps",
    GraphQL.subscriptionFromFile("googleContainerBuilder", __dirname))
@Tags("push", "ci", "docker", "spring")
export class GoogleContainerBuilder implements HandleEvent<GoogleContainerBuilderSub.Subscription> {

    public handle(e: EventFired<GoogleContainerBuilderSub.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {

        let googleCloudKey: any;
        try {
            // tslint:disable-next-line:no-var-requires
            googleCloudKey = require(`${appRoot}/../creds/ri-gcb.json`);
        } catch (e) {
            logger.warn("no Google Cloud service account key, will not perform Google Container builds");
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
            .then(tokens => validateAndBuild(e, tokens), err => {
                logger.error("failed to authenticate with Google: %j", err);
                return Failure;
            });
    }
}

/**
 * Ensure event(s) has all the needed information, then build.
 */
function validateAndBuild(e: EventFired<GoogleContainerBuilderSub.Subscription>, tokens: any): Promise<HandlerResult> {

    return Promise.all(e.data.Push.map(p => {
        if (!p.branch) {
            logger.debug("no branch");
            return Success;
        }
        if (!p.repo) {
            logger.debug("no repo");
            return Success;
        }
        const repo = p.repo.name;
        if (!repo) {
            logger.debug("no repo name");
            return Success;
        }
        if (!p.repo.org) {
            logger.debug("no org");
            return Success;
        }
        const owner = p.repo.org.owner;
        if (!owner) {
            logger.debug("no org owner");
            return Success;
        }
        if (!p.after) {
            logger.debug("no after commit");
            return Success;
        }
        const repoSlug = `${owner}/${repo}`;
        const sha = p.after.sha;
        if (!sha) {
            logger.debug("no after commit sha");
            return Success;
        }
        const gitHubComProviderId = "zjlmxjzwhurspem";
        const providerId = (p.repo.org.provider && p.repo.org.provider.providerId) ?
            p.repo.org.provider.providerId : gitHubComProviderId;
        if (providerId !== gitHubComProviderId) {
            logger.info(`repo ${repoSlug} is not provided by github.com`);
            return Success;
        }
        if (!p.repo.org.team) {
            logger.debug("no team");
            return Success;
        }
        const teamId = p.repo.org.team.id;
        if (!teamId) {
            logger.info("team has no ID");
            return Success;
        }

        return cloneAndBuild(owner, repo, p.branch, sha, teamId, tokens)
            .catch(err => {
                logger.error("uncaught error from cloneAndBuild: %j", err);
                return Failure;
            });
    }))
        .then(results => results.some(res => res === Failure) ? Failure : Success, failure);
}

/**
 * Clone Git repo in temp directory and checkout commit, then build.
 *
 * @param owner repo owner
 * @param repo repo name
 * @param branch commit branch
 * @param commit commit SHA
 * @param teamId ID of Atomist team
 * @param token Google tokens
 * @return handler result
 */
export function cloneAndBuild(
    owner: string,
    repo: string,
    branch: string,
    commit: string,
    teamId: string,
    tokens: any,
): Promise<HandlerResult> {

    const repoSlug = `${owner}/${repo}`;
    return tmp.dir()
        .then(tmpDir => {
            const projectDir = path.join(tmpDir.path, repo);
            const cloneUrl = `https://github.com/${repoSlug}.git`;
            const cloneCmd = `git clone --quiet --depth 10 --branch ${branch} ${cloneUrl} ${repo}`;
            return exec(cloneCmd, { cwd: tmpDir.path })
                .then(() => {
                    return exec(`git checkout -qf ${commit}`, { cwd: tmpDir.path })
                        .then(() => {
                            return checkAndBuild(projectDir, owner, repo, branch, commit, teamId, tokens)
                                .catch(err => {
                                    logger.error("build of %s:%s:%s failed: %j", repoSlug, branch, commit, err);
                                    return Failure;
                                });
                        }, err => {
                            logger.warn("failed to check out %s %s, skipping: %j", repoSlug, commit, err);
                            return Success;
                        });
                }, err => {
                    logger.warn("failed to clone %s, assuming private repo, skipping: %j", repoSlug, err);
                    return Success;
                })
                .then(res => {
                    tmpDir.cleanup();
                    return res;
                });
        }, err => {
            logger.error("failed to create temporary directory: %j", err);
            return Failure;
        });
}

/**
 * Ensure the project is a valid sample Spring project then build.
 *
 * @param projectDir file system location of the project to buidl
 * @param owner repo owner
 * @param repo repo name
 * @param branch commit branch
 * @param commit commit SHA
 * @param teamId ID of Atomist team
 * @param tokens Google Cloud tokens
 * @return handler result
 */
export function checkAndBuild(
    projectDir: string,
    owner: string,
    repo: string,
    branch: string,
    commit: string,
    teamId: string,
    tokens: any,
): Promise<HandlerResult> {

    const repoSlug = `${owner}/${repo}`;
    return gcbEligible(projectDir)
        .then(eligible => {
            if (!eligible) {
                logger.debug("repo %s does not meet GCB eligibility", repoSlug);
                return Success;
            }
            return gcBuild(projectDir, owner, repo, branch, commit, teamId, tokens);
        }, err => {
            logger.error("failed to check eligibility of %s: %j", repoSlug, err);
            return Failure;
        });
}

export function gcbEligible(projectDir: string): Promise<boolean> {
    const buildTrigger = path.join(projectDir, ".atm-gcb");
    const pomPath = path.join(projectDir, "pom.xml");
    const mvnPath = path.join(projectDir, "mvnw");
    // tslint:disable-next-line:max-line-length
    const springRegExp = /<groupId>org\.springframework\.boot<\/groupId>\s*<artifactId>spring-boot-starter-parent<\/artifactId>/;
    const checks: Array<() => Promise<boolean>> = [
        () => fs.pathExists(buildTrigger),
        () => fs.pathExists(pomPath),
        () => fs.pathExists(mvnPath),
        () => fs.readFile(pomPath).then(pom => springRegExp.test(pom.toLocaleString())),
    ];
    return Promise.all(checks.map(f => f()))
        .then(results => !results.some(r => !r));
}

/**
 * Build the project in projectDir, sending build and link-image webhooks
 * along the way.
 *
 * @param projectDir file system location of the project to buidl
 * @param owner repo owner
 * @param repo repo name
 * @param branch commit branch
 * @param commit commit SHA
 * @param teamId ID of Atomist team
 * @param tokens Google Cloud tokens
 * @return handler result
 */
export function gcBuild(
    projectDir: string,
    owner: string,
    repo: string,
    branch: string,
    commit: string,
    teamId: string,
    tokens: any,
): Promise<HandlerResult> {

    const repoSlug = `${owner}/${repo}`;
    const ciSrc = path.join(appRoot.path, "assets", "ci");
    return fs.copy(ciSrc, projectDir)
        .then(() => {
            // post start build webhook, do not wait
            postBuildWebhook(repo, owner, branch, commit, "started", teamId);
            return gcBuilder();
        })
        .then(status => {
            if (status === "passed") {
                const image = "something/here:latest";
                // post link-image webhook, do not wait
                postLinkImageWebhook(owner, repo, commit, image, teamId);
            }
            // post build success webhook, do not wait
            postBuildWebhook(repo, owner, branch, commit, status, teamId);
            return Success;
        })
        .catch((err: any) => {
            logger.error("build of %s in %s errored: %j", repoSlug, projectDir, err);
            postBuildWebhook(repo, owner, branch, commit, "error", teamId);
            return Failure;
        });
}
