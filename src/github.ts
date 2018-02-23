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

import { logger } from "@atomist/automation-client";
import * as Github from "@octokit/rest";
import promiseRetry = require("promise-retry");

import { AtomistBuildStatus } from "./atomistWebhook";

type GitHubCommitStatusState = "pending" | "success" | "error" | "failure";

export const atomistKubeBuildContext = "build/atomist/k8s";

/**
 * Create GitHub commit status for Atomist Kubernetes build, mapping
 * AtomistBuildStatus to GitHub commit status state.  It will retry.
 *
 * @param owner repo owner
 * @param repo repo name
 * @param sha commit SHA
 * @param status Atomist build status
 * @param github GitHub API client
 * @param url optional commit status URL
 * @return true if successful, false if all attempts fail
 */
export function createBuildCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    status: AtomistBuildStatus,
    github: Github,
    url?: string,
): Promise<boolean> {

    const repoSlug = `${owner}/${repo}`;
    const description = "Atomist continuous integration build for Google Container Builder";
    const context = atomistKubeBuildContext;
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
    if (url) {
        params.target_url = url;
    }
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
