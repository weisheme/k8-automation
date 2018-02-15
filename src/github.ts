/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
 */

import { logger } from "@atomist/automation-client";
import * as Github from "@octokit/rest";
import promiseRetry = require("promise-retry");

import { AtomistBuildStatus } from "./atomistWebhook";

type GitHubCommitStatusState = "pending" | "success" | "error" | "failure";

/**
 * Create GitHub commit status, mapping AtomistBuildStatus to GitHub
 * commit status state.  It will retry.
 *
 * @param projectDir file system location of the project to build
 * @param owner repo owner
 * @param repo repo name
 * @param branch commit branch
 * @param sha commit SHA
 * @param teamId ID of Atomist team
 * @return true if successful, false if all attempts fail
 */
export function createCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    status: AtomistBuildStatus,
    github: Github,
): Promise<boolean> {

    const repoSlug = `${owner}/${repo}`;
    const description = "Atomist Continuous Integration for Google Container Builder";
    const context = "continuous-integration/atomist/google-container-builder";
    let state: GitHubCommitStatusState; // Github.RepoCreateStatusParams.state;
    switch (status) {
        case "started":
            state = "pending";
            break;
        case "failed":
            state = "failure";
            break;
        case "passed":
            state = "success";
            break;
        case "error":
        case "canceled":
            state = "error";
            break;
        default:
            logger.error(`unknown AtomistBuildStatus for ${repoSlug}:${sha}: ${status}`);
            state = "error";
            break;
    }
    const params: Github.ReposCreateStatusParams = {
        owner,
        repo,
        sha,
        state,
        description,
        context,
    };
    const retryOptions = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 500,
        maxTimeout: 5 * 1000,
        randomize: true,
    };
    return promiseRetry(retryOptions, (retry, retryCount) => {
        return github.repos.createStatus(params)
            .then(() => true)
            .catch(e => {
                logger.debug(`error creating commit state ${state} for ${repoSlug}:${sha} attempt ${retryCount}: ` +
                    e.message);
                retry(e);
            });
    })
        .catch(e => {
            logger.error(`failed to create commit state ${state} for ${repoSlug}:${sha}: ${e.message}`);
            return false;
        });
}
