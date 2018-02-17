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
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as path from "path";
import * as tmp from "tmp-promise";

import { preErrMsg, reduceResults } from "../error";
import { createCommitStatus, GoogleContainerBuilderContext } from "../github";
import { upsertDeployment } from "../k8";
import { KubeDeploySub } from "../typings/types";

@EventHandler("deploy image to kubernetes cluster",
    GraphQL.subscriptionFromFile("kubeDeploy", __dirname))
@Tags("push", "ci", "docker", "spring")
export class KubeDeploy implements HandleEvent<KubeDeploySub.Subscription> {

    @Secret(Secrets.OrgToken)
    private githubToken: string;

    public handle(ev: EventFired<KubeDeploySub.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {

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

        return Promise.all(ev.data.ImageLinked.map(il => {

            if (!eligibleImageLink(il)) {
                logger.info("push is not eligible for GKE deploy");
                return Promise.resolve(Success);
            }
            const ns = il.commit.repo.org.owner;
            const name = il.commit.repo.name;
            const image = il.image.imageName;

            return upsertDeployment(k8Config, ns, name, image)
                .then(() => Success, e => {
                    const message = `failed to deploy ${ns}/${name} image ${image}: ${e.message}`;
                    logger.error(message);
                    return { code: Failure.code, message };
                });
        }))
            .then(results => reduceResults(results));
    }
}

/**
 * Determine if ImageLinked event should be deployed to GKE.
 *
 * @param il ImageLinked event
 * @return true if eligible, false otherwise
 */
export function eligibleImageLink(il: KubeDeploySub.ImageLinked): boolean {
    return il.commit.statuses.some(s => s.context === GoogleContainerBuilderContext && s.state === "success");
}
