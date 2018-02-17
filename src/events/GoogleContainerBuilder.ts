/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
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

import { postBuildWebhook, postLinkImageWebhook } from "../atomistWebhook";
import { preErrMsg, reduceResults } from "../error";
import { createCommitStatus } from "../github";
import { googleContainerBuild, imageTag } from "../googleContainerBuilder";
import { GoogleContainerBuilderSub } from "../typings/types";

@EventHandler("use Google Container Builder to build a Docker image for Spring Boot apps",
    GraphQL.subscriptionFromFile("googleContainerBuilder", __dirname))
@Tags("push", "ci", "docker", "spring")
export class GoogleContainerBuilder implements HandleEvent<GoogleContainerBuilderSub.Subscription> {

    @Secret(Secrets.OrgToken)
    private githubToken: string;

    public handle(ev: EventFired<GoogleContainerBuilderSub.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {

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

        return Promise.all(ev.data.Push.map(p => {

            if (!eligiblePush(p)) {
                logger.info("push is not eligible for GoogleContainerBuilder");
                return Promise.resolve(Success);
            }

            return jwtClient.authorize()
                .then(tokens => cloneAndBuild(p, jwtClient, github), e => {
                    logger.warn("failed to authorize with Google Cloud, will not perform Google Container builds: " +
                        e.message);
                    return Success;
                });
        }))
            .then(results => reduceResults(results));
    }
}

/**
 * Make sure even has all the data it needs to GoogleContainerBuilder.
 *
 * @param e event
 */
function eligiblePush(p: GoogleContainerBuilderSub.Push): boolean {
    const defaultBranch = p.repo.defaultBranch || "master";
    if (p.branch !== defaultBranch) {
        logger.debug(`${p.repo.org.owner}/${p.repo.name} push branch ${p.branch} is not default ${defaultBranch}`);
        return false;
    }
    return true;
}

/**
 * Clone Git repo in temp directory and checkout commit, then call checkAndBuild.
 *
 * @param p push event
 * @param jwtClient Google Cloud JWT client
 * @param github authenticated Github @octokit/rest client
 * @return handler result
 */
export function cloneAndBuild(
    p: GoogleContainerBuilderSub.Push,
    jwtClient: JWT,
    github: Github,
): Promise<HandlerResult> {

    const branch = p.branch;
    const repo = p.repo.name;
    const owner = p.repo.org.owner;
    const repoSlug = `${owner}/${repo}`;
    const sha = p.after.sha;
    const teamId = p.repo.org.team.id;

    return tmp.dir({ unsafeCleanup: true })
        .catch(e => Promise.reject(preErrMsg(e, `failed to create temp dir for ${repoSlug}`)))
        .then(tmpDir => {
            const projectDir = path.join(tmpDir.path, repo);
            const cloneUrl = `https://github.com/${repoSlug}.git`;
            const cloneCmd = `git clone --quiet --depth 10 --branch ${branch} ${cloneUrl} ${repo}`;
            return exec(cloneCmd, { cwd: tmpDir.path })
                .then(() => {
                    return exec(`git checkout --quiet --force ${sha}`, { cwd: projectDir })
                        .then(() => {
                            return checkAndBuild(projectDir, owner, repo, branch, sha, teamId, jwtClient, github)
                                .catch(e => {
                                    logger.error(`build of ${repoSlug}:${sha} failed: ${e.message}`);
                                    return Failure;
                                });
                        }, e => {
                            logger.warn(`failed to check out ${repoSlug}:${sha}, skipping: ${e.message}`);
                            return Success;
                        });
                }, e => {
                    logger.warn(`failed to clone ${repoSlug}, assuming private repo, skipping: ${e.message}`);
                    return Success;
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
 * @param projectDir file system location of the project to buidl
 * @param owner repo owner
 * @param repo repo name
 * @param branch commit branch
 * @param sha commit SHA
 * @param teamId ID of Atomist team
 * @param jwtClient Google Cloud JWT client
 * @param github authenticated Github @octokit/rest client
 * @return handler result
 */
export function checkAndBuild(
    projectDir: string,
    owner: string,
    repo: string,
    branch: string,
    sha: string,
    teamId: string,
    jwtClient: JWT,
    github: Github,
): Promise<HandlerResult> {

    const repoSlug = `${owner}/${repo}`;
    return gcbEligible(projectDir)
        .catch(e => Promise.reject(preErrMsg(e, `failed to check eligibility of ${repoSlug}`)))
        .then(eligible => {
            if (!eligible) {
                logger.debug(`repo ${repoSlug} does not meet GCB eligibility`);
                return Success;
            }
            return gcBuild(projectDir, owner, repo, branch, sha, teamId, jwtClient, github);
        });
}

/**
 * Run through a series of checks to ensure cloned project is worthy of a Google Container Build.
 *
 * @param projectDir local path to cloned repo
 * @return true if eligible
 */
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
        .then(results => results.every(r => r));
}

/**
 * Build the project in projectDir, sending build and link-image webhooks
 * along the way.
 *
 * @param projectDir file system location of the project to build
 * @param owner repo owner
 * @param repo repo name
 * @param branch commit branch
 * @param sha commit SHA
 * @param teamId ID of Atomist team
 * @param jwtClient Google Cloud JWT client
 * @param github authenticated Github @octokit/rest client
 * @return handler result
 */
export function gcBuild(
    projectDir: string,
    owner: string,
    repo: string,
    branch: string,
    sha: string,
    teamId: string,
    jwtClient: JWT,
    github: Github,
): Promise<HandlerResult> {

    const repoSlug = `${owner}/${repo}`;
    const ciSrc = path.join(appRoot.path, "assets", "ci");

    return fs.copy(ciSrc, projectDir)
        .catch(e => Promise.reject(preErrMsg(e, `failed to copy ${ciSrc} to ${projectDir}`)))
        .then(() => {
            const status = "started";
            postBuildWebhook(owner, repo, branch, sha, status, teamId);
            createCommitStatus(owner, repo, sha, status, github);
            return googleContainerBuild(projectDir, owner, repo, sha, jwtClient);
        })
        .then(status => {
            logger.debug(`${repoSlug}:${sha} build status: ${status}`);
            if (status === "passed") {
                const image = imageTag(owner, repo, sha);
                postLinkImageWebhook(owner, repo, sha, image, teamId);
            }
            postBuildWebhook(owner, repo, branch, sha, status, teamId);
            createCommitStatus(owner, repo, sha, status, github);
            return Success;
        })
        .catch(e => {
            const status = "error";
            postBuildWebhook(owner, repo, branch, sha, status, teamId);
            createCommitStatus(owner, repo, sha, status, github);
            return Promise.reject(preErrMsg(e, `build of ${repoSlug} in ${projectDir} errored`));
        });
}
