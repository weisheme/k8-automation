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
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as path from "path";
import * as tmp from "tmp-promise";

import { preErrMsg, reduceResults } from "../error";
import { upsertDeployment } from "../k8";
import { KubeDeploySub } from "../typings/types";

@EventHandler("deploy image to kubernetes cluster",
    GraphQL.subscriptionFromFile("kubeDeploy", __dirname))
@Tags("push", "ci", "docker", "spring")
export class KubeDeploy implements HandleEvent<KubeDeploySub.Subscription> {

    @Secret(Secrets.OrgToken)
    private githubToken: string;

    public handle(ev: EventFired<KubeDeploySub.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {

        return Promise.all(ev.data.Status.map(s => {

            const owner = s.commit.repo.org.owner;
            const repo = s.commit.repo.name;
            const teamId = s.commit.repo.org.team.id;
            // this will not work for monorepos that create multiple images from single commit
            const image = s.commit.images[0].imageName;
            const env = eligibleDeployStatus(s);
            if (!env) {
                logger.info("push is not eligible for GKE deploy");
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
                    `kube deploy: ${e.message}`);
                return Promise.resolve(Success);
            }

            let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
            const cfgPath = path.join(appRoot.path, "..", "creds", "kube", "config");
            try {
                const kubeconfig = k8.config.loadKubeconfig(cfgPath);
                k8Config = k8.config.fromKubeconfig(kubeconfig);
            } catch (e) {
                logger.debug(`failed to use ${cfgPath}: ${e.message}`);
                try {
                    k8Config = k8.config.getInCluster();
                } catch (er) {
                    logger.debug(`failed to use in-cluster-config: ${er.message}`);
                    logger.warn("failed to use either kubeconfig or in-cluster-config, will not deploy: " +
                        `${e.message};${er.message}`);
                    return Promise.resolve(Success);
                }
            }

            return upsertDeployment(k8Config, owner, repo, teamId, image, env)
                .then(() => Success, e => {
                    const message = `failed to deploy image ${image}: ${e.message}`;
                    logger.error(message);
                    return { code: Failure.code, message };
                });
        }))
            .then(results => reduceResults(results));
    }
}

/**
 * Determine if status event should be deployed to GKE.
 *
 * @param s status event
 * @return environment string if eligible, undefined otherwise
 */
export function eligibleDeployStatus(s: KubeDeploySub.Status): string {
    const prefix = "deploy/atomist/k8s/";
    if (s.context.indexOf(prefix) !== 0) {
        logger.debug(`${s.commit.repo.org.owner}/${s.commit.repo.name} commit status does not start with ${prefix}`);
        return undefined;
    }
    const env = s.context.replace(prefix, "");
    return env;
}
