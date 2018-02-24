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
import { ingressBaseUrl } from "./k8";

export type GitHubCommitStatusState = "pending" | "success" | "error" | "failure";

export const kubeBuildContextPrefix = "build/atomist/k8s/";
export const kubeDeployContextPrefix = "deploy/atomist/k8s/";

/**
 * Create GitHub commit status.  It will retry.
 *
 * @param github GitHub API client
 * @param owner repo owner
 * @param repo repo name
 * @param sha commit SHA
 * @param state valid GitHub commit status
 * @param context commit status context
 * @param description free text description
 * @param url optional commit status URL
 * @return true if successful, false if all attempts fail
 */
export function createCommitStatus(
    github: Github,
    owner: string,
    repo: string,
    sha: string,
    state: GitHubCommitStatusState,
    context?: string,
    description?: string,
    url?: string,
): Promise<boolean> {

    const repoSlug = `${owner}/${repo}`;
    const params: Github.ReposCreateStatusParams = {
        owner,
        repo,
        sha,
        state,
    };
    if (context) {
        params.context = context;
    }
    if (description) {
        params.description = description;
    }
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

/**
 * Create GitHub commit status for Atomist Kubernetes build, mapping
 * AtomistBuildStatus to GitHub commit status state.  It will retry.
 *
 * @param github GitHub API client
 * @param owner repo owner
 * @param repo repo name
 * @param sha commit SHA
 * @param status Atomist build status
 * @param context commit status context, usually build/atomist/k8s/BRANCH
 * @param url optional commit status URL
 * @param description optional commit status free text description
 * @return true if successful, false if all attempts fail
 */
export function createBuildCommitStatus(
    github: Github,
    owner: string,
    repo: string,
    sha: string,
    status: AtomistBuildStatus,
    context: string,
    url?: string,
    description: string = "Atomist continuous integration build for Google Container Builder",
): Promise<boolean> {

    const repoSlug = `${owner}/${repo}`;
    let state: GitHubCommitStatusState;
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
    return createCommitStatus(github, owner, repo, sha, state, context, description, url);
}

/**
 * Create GitHub commit status for Atomist Kubernetes deploy with
 * ingress path endpoint for the URL.  It will retry.
 *
 * @param github GitHub API client
 * @param owner repository owner, i.e., organization or user
 * @param repo repository name
 * @param sha commit SHA
 * @param teamId Atomist team ID
 * @param env deployment environment
 * @param state status state
 * @return true if successful, false if all attempts fail
 */
export function createDeployCommitStatus(
    github: Github,
    owner: string,
    repo: string,
    sha: string,
    teamId: string,
    env: string,
    description: string = "Atomist Kubernetes deployment service endpoint",
    state: GitHubCommitStatusState = "success",
): Promise<boolean> {

    const context = kubeDeployContextPrefix + env;
    const url = ingressBaseUrl(owner, repo, teamId, env);
    return createCommitStatus(github, owner, repo, sha, state, context, description, url);
}
