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
    GraphQL,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    reduceResults,
    Success,
    SuccessPromise,
    Tags,
} from "@atomist/automation-client";
import { automationClientInstance } from "@atomist/automation-client/automationClient";
import {
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm/common/delivery/goals/storeGoals";
import { fetchCommitForSdmGoal } from "@atomist/sdm/common/delivery/goals/support/fetchGoalsOnCommit";
import { SdmGoal } from "@atomist/sdm/ingesters/sdmGoalIngester";
import * as appRoot from "app-root-path";
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as path from "path";

import { preErrMsg } from "../error";
import {
    KubeApplication,
    KubeApplicationRequest,
    upsertApplication,
} from "../k8";
import { SdmGoalSub } from "../typings/types";

export interface CommitForSdmGoal {
    image?: {
        imageName?: string;
    };
}

@EventHandler("deploy image to Kubernetes cluster", GraphQL.subscription("sdmGoal"))
@Tags("deploy", "kubernetes")
export class KubeDeploy implements HandleEvent<SdmGoalSub.Subscription> {

    public handle(ev: EventFired<SdmGoalSub.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {

        return Promise.all(ev.data.SdmGoal.map(g => {
            const sdmGoal = g as SdmGoal;
            return fetchCommitForSdmGoal(ctx, sdmGoal)
                .then((commit: CommitForSdmGoal) => {
                    const eligible = eligibleDeployGoal(sdmGoal, commit);
                    if (eligible !== Success) {
                        logger.info(`SDM goal is not eligible for Kubernetes deploy: ${eligible.message}`);
                        return Success;
                    }

                    const repo = g.repo.name;
                    const owner = g.repo.owner;
                    const sha = g.sha;
                    const teamId = ctx.teamId;
                    const env = automationClientInstance().configuration.environment;
                    const depName = `${teamId}:${env}:${owner}:${repo}:${sha}`;
                    if (!commit.image) {
                        const msg = `Kubernetes deploy requested for ${depName} but that commit ` +
                            `has no Docker image associated with it`;
                        return failGoal(ctx, sdmGoal, msg);
                    }
                    const image = commit.image.imageName;
                    logger.debug(`Processing ${depName}`);

                    let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
                    const cfgPath = path.join(appRoot.path, "..", "creds", "kube", "config");
                    try {
                        const kubeconfig = k8.config.loadKubeconfig(cfgPath);
                        k8Config = k8.config.fromKubeconfig(kubeconfig);
                    } catch (e) {
                        logger.debug(`Failed to use ${cfgPath}: ${e.message}`);
                        try {
                            k8Config = k8.config.getInCluster();
                        } catch (er) {
                            logger.debug(`Failed to use in-cluster-config: ${er.message}`);
                            const msg = `Failed to use either kubeconfig or in-cluster-config, will not deploy ` +
                                `${depName} to Kubernetes ${e.message};${er.message}`;
                            return failGoal(ctx, sdmGoal, msg);
                        }
                    }

                    if (!sdmGoal.data) {
                        const msg = `SDM goal data property is false for ${depName}, cannot deploy: ` +
                            `'${stringify(sdmGoal)}'`;
                        return failGoal(ctx, sdmGoal, msg);
                    }
                    let sdmData: any;
                    try {
                        sdmData = JSON.parse(sdmGoal.data);
                    } catch (e) {
                        const msg = `Failed to parse SDM goal data '${sdmGoal.data}' as JSON for ${depName}: ` +
                            e.message;
                        return failGoal(ctx, sdmGoal, msg);
                    }
                    if (!sdmData.kubernetes) {
                        const msg = `SDM goal data kuberenetes property is false for ${depName}, cannot deploy: ` +
                            `'${stringify(sdmData)}'`;
                        return failGoal(ctx, sdmGoal, msg);
                    }
                    const kubeApp: KubeApplication = sdmData.kubernetes;
                    if (!kubeApp.name) {
                        const msg = `SDM goal data kuberenetes name property is false for ${depName}, cannot deploy: ` +
                            `'${stringify(sdmData)}'`;
                        return failGoal(ctx, sdmGoal, msg);
                    }
                    kubeApp.ns = kubeApp.ns || "default";
                    if (kubeApp.environment !== env) {
                        logger.info(`SDM goal data kuberenetes environment '${kubeApp.environment}' is not this ` +
                            `environment '${env}'`);
                        return Success;
                    }

                    logger.info(`Deploying ${depName} to Kubernetes`);
                    const upsertReq: KubeApplicationRequest = {
                        ...kubeApp,
                        config: k8Config,
                        teamId,
                        image,
                    };
                    return upsertApplication(upsertReq)
                        .catch(e => {
                            const msg = `Failed to deploy ${depName} to Kubernetes: ${e.message}`;
                            return failGoal(ctx, sdmGoal, msg);
                        })
                        .then(() => {
                            logger.info(`Successfully deployed ${depName} to Kubernetes`);
                            const params: UpdateSdmGoalParams = {
                                state: "success",
                                description: `Deployed to Kubernetes namespace \`${kubeApp.ns}\``,
                            };
                            return updateGoal(ctx, sdmGoal, params)
                                .then(() => Success, err => {
                                    const message = `Successfully deployed ${depName} to Kubernetes, but failed to ` +
                                        `update the SDM goal: ${err.message}`;
                                    logger.error(message);
                                    return { code: 1, message };
                                });
                        });
                });
        }))
            .then(results => reduceResults(results));
    }
}

/**
 * Determine if SDM goal event should trigger a deployment to
 * Kubernetes.
 *
 * @param g SDM goal event
 * @return Success if eligible, Failure if not, with message properly populated
 */
export function eligibleDeployGoal(goal: SdmGoal, commit: CommitForSdmGoal): HandlerResult {
    if (!goal.fulfillment) {
        return { code: 1, message: `SDM goal contains no fulfillment: ${stringify(goal)}` };
    }
    const atmName = "@atomist/k8-automation";
    if (goal.fulfillment.name !== atmName) {
        return { code: 1, message: `SDM goal fulfillment name '${goal.fulfillment.name}' is not '${atmName}` };
    }
    const atmMethod = "side-effect";
    if (goal.fulfillment.method !== atmMethod) {
        return { code: 1, message: `SDM goal fulfillment method '${goal.fulfillment.method}' is not '${atmMethod}` };
    }
    if (goal.state !== "requested") {
        return { code: 1, message: `SDM goal state '${goal.state}' is not 'requested'` };
    }
    return Success;
}

/**
 * Fail the provided goal using the message to set the description and
 * error message.
 *
 * @param ctx handler context to use to send the update
 * @param goal SDM goal to update
 * @param message informative error message
 * @return a failure handler result using the provided error message
 */
function failGoal(ctx: HandlerContext, goal: SdmGoal, message: string): Promise<HandlerResult> {
    logger.error(message);
    const params: UpdateSdmGoalParams = {
        state: "failure",
        description: message,
        error: new Error(message),
    };
    return updateGoal(ctx, goal, params)
        .then(() => ({ code: 1, message }), err => {
            const msg = `Failed to update SDM goal '${stringify(goal)}' with params ` +
                `'${stringify(params)}': ${err.message}`;
            logger.error(msg);
            return { code: 2, message: `${message}; ${msg}` };
        });
}
