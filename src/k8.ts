/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
 */

import { logger } from "@atomist/automation-client";
import * as appRoot from "app-root-path";
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as path from "path";

import { preErrMsg } from "./error";

/**
 * Create or update a deployment.
 *
 * @param config a kubernetes ClusterConfiguration or ClientConfiguration
 * @param ns namespace to create resources in
 * @param name name of deployment/service
 * @param image full Docker tag of image, i.e., [REPO/]OWNER/NAME:TAG
 * @return Promise
 */
export function upsertDeployment(
    config: k8.ClusterConfiguration | k8.ClientConfiguration,
    ns: string,
    name: string,
    image: string,
): Promise<void> {

    const core = new k8.Core(config);
    const ext = new k8.Extensions(config);

    return ext.namespaces(ns).deployments(name).get()
        .then(dep => {
            logger.debug(`updating deployment ${ns}/${name} using ${image}`);
            return updateDeployment(ext, dep, image);
        }, e => {
            logger.debug(`failed to find existing ${ns}/${name} deployment: ${e.message}`);
            logger.debug(`creating deployment and service ${ns}/${name} using ${image}`);
            return createDeployment(core, ext, ns, name, image);
        })
        .catch(e => {
            return Promise.reject(preErrMsg(e, `upserting ${ns}/${name} using ${image} failed`));
        });

}

interface Metadata {
    name: string;
    generateName?: string;
    namespace?: string;
    selfLink?: string;
    uid?: string;
    resourceVersion?: string;
    generation?: number;
    creationTimestamp?: string;
    deletionTimestamp?: string;
    deletionGracePeriodSeconds?: number;
    labels?: {
        [key: string]: string;
    };
    annotations?: {
        [key: string]: string;
    };
    clusterName?: string;
}

interface Namespace {
    apiVersion: "v1";
    kind: "Namespace";
    metadata: Metadata;
}

interface MatchSelector {
    matchLabels?: {
        [key: string]: string;
    };
    matchExpressions?: string[];
}

interface Selector {
    [key: string]: string;
}

interface HttpHeader {
    name: string;
    value: string;
}

type UriScheme = "HTTP" | "HTTPS";

interface Probe {
    httpGet?: {
        path?: string;
        port?: string;
        host?: string;
        scheme?: UriScheme;
        httpHeaders?: HttpHeader[];
    };
    initialDelaySeconds?: number;
    timeoutSeconds?: number;
    periodSeconds?: number;
    successThreshold?: number;
    failureThreshold?: number;
}

type Protocol = "TCP" | "UDP";

interface ContainerPort {
    name?: string;
    hostPort?: number;
    containerPort: number;
    protocol?: Protocol;
    hostIP?: string;
}

interface Resource {
    cpu?: string | number;
    memory?: string | number;
}

interface Container {
    name: string;
    image?: string;
    imagePullPolicy?: "Always" | "IfNotPresent" | "Never";
    resources?: {
        limits?: Resource;
        requests?: Resource;
    };
    readinessProbe?: Probe;
    livenessProbe?: Probe;
    ports?: ContainerPort[];
}

interface PodSpec {
    containers: Container[];
}

interface PodTemplate {
    metadata?: Metadata;
    spec?: PodSpec;
}

interface Deployment {
    apiVersion: "extensions/v1beta1";
    kind: "Deployment";
    metadata?: Metadata;
    spec?: {
        replicas?: number;
        revisionHistoryLimit?: number;
        selector?: MatchSelector;
        template: PodTemplate;
        strategy?: {
            type: "Recreate" | "RollingUpdate";
            rollingUpdate?: {
                maxUnavailable?: number;
                maxSurge?: number;
            };
        };
    };
}

interface ServicePort {
    name?: string;
    protocol?: Protocol;
    port: number;
    targetPort?: number | string;
    nodePort?: number;
}

interface SessionAffinityConfig {
    clientIP?: {
        timeoutSeconds?: number;
    };
}

interface Service {
    kind: "Service";
    apiVersion: "v1";
    metadata: Metadata;
    spec: {
        ports: ServicePort[];
        selector?: Selector;
        clusterIP?: string;
        type?: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName";
        externalIPs?: string[];
        sessionAffinity?: "ClientIP" | "None";
        loadBalancerIP?: string;
        loadBalancerSourceRanges?: string[];
        externalName?: string;
        externalTrafficPolicy?: "Local" | "Cluster";
        healthCheckNodePort?: number;
        publishNotReadyAddresses?: boolean;
        sessionAffinityConfig?: SessionAffinityConfig;
    };
}

/**
 * Update the image of the first container in a deployment pod template.
 *
 * @param dep current deployment spec
 * @param image new image tagname
 * @return new deployment spec
 */
function updateDeployment(ext: k8.ApiGroup, dep: Deployment, image: string): Promise<any> {
    const name = dep.metadata.name;
    const ns = dep.metadata.namespace;
    const patch: Partial<Deployment> = { spec: { template: { spec: { containers: [{ name, image }] } } } };
    return ext.namespaces(ns).deployments(name).patch({ body: patch })
        .catch(e => Promise.reject(preErrMsg(e, `failed to patch deployment ${ns}/${name} with image ${image}`)));
}

/**
 * Create a deployment from a standard spec template.
 *
 * @param core k8 Core client
 * @param ext k8 Extension client
 * @param ns where to create the deployment
 * @param name name of the deployment
 * @param image image tag for deployment pod template container
 * @return created deployment spec
 */
function createDeployment(
    core: k8.ApiGroup,
    ext: k8.ApiGroup,
    ns: string,
    name: string,
    image: string,
): Promise<any> {

    const space: Namespace = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: ns,
        },
    };
    const svc: Service = JSON.parse(stringify(serviceTemplate));
    svc.metadata.name = name;
    svc.metadata.namespace = ns;
    svc.metadata.labels.service = name;
    svc.metadata.labels.ns = ns;
    svc.spec.selector.app = name;
    svc.spec.selector.ns = ns;
    const dep: Deployment = JSON.parse(stringify(deploymentTemplate));
    dep.metadata.name = name;
    dep.spec.selector.matchLabels.app = name;
    dep.spec.selector.matchLabels.ns = ns;
    dep.spec.template.metadata.name = name;
    dep.spec.template.metadata.labels.app = name;
    dep.spec.template.metadata.labels.ns = ns;
    dep.spec.template.spec.containers[0].name = name;
    dep.spec.template.spec.containers[0].image = image;
    return core.namespaces(ns).get()
        .catch(e => {
            logger.debug(`failed to get namespace ${ns}, creating it: ${e.message}`);
            return core.namespaces.post({ body: space })
                .catch(er => Promise.reject(preErrMsg(er, `failed to create namespace ${stringify(space)}`)));
        })
        .then(() => core.namespaces(ns).services.post({ body: svc })
            .catch(e => Promise.reject(preErrMsg(e, `failed to create service: ${stringify(svc)}`))))
        .then(() => ext.namespaces(ns).deployments.post({ body: dep })
            .catch(e => Promise.reject(preErrMsg(e, `failed to create deployment: ${stringify(dep)}`))));
}

const deploymentTemplate: Deployment = {
    apiVersion: "extensions/v1beta1",
    kind: "Deployment",
    metadata: {
        name: "spring-rest",
    },
    spec: {
        replicas: 1,
        revisionHistoryLimit: 3,
        selector: {
            matchLabels: {
                app: "spring-rest",
                ns: "default",
            },
        },
        template: {
            metadata: {
                name: "spring-rest",
                labels: {
                    app: "spring-rest",
                    ns: "default",
                },
            },
            spec: {
                containers: [
                    {
                        name: "spring-rest",
                        image: "gcr.io/reference-implementation-1/spring-rest-seed:0.0.1-SNAPSHOT",
                        imagePullPolicy: "IfNotPresent",
                        resources: {
                            limits: {
                                cpu: "300m",
                                memory: "384Mi",
                            },
                            requests: {
                                cpu: "100m",
                                memory: "320Mi",
                            },
                        },
                        readinessProbe: {
                            httpGet: {
                                path: "/info",
                                port: "http",
                                scheme: "HTTP",
                            },
                            initialDelaySeconds: 60,
                            timeoutSeconds: 3,
                            periodSeconds: 10,
                            successThreshold: 1,
                            failureThreshold: 3,
                        },
                        livenessProbe: {
                            httpGet: {
                                path: "/health",
                                port: "http",
                                scheme: "HTTP",
                            },
                            initialDelaySeconds: 60,
                            timeoutSeconds: 3,
                            periodSeconds: 10,
                            successThreshold: 1,
                            failureThreshold: 3,
                        },
                        ports: [
                            {
                                name: "http",
                                containerPort: 8080,
                                protocol: "TCP",
                            },
                        ],
                    },
                ],
            },
        },
        strategy: {
            type: "RollingUpdate",
            rollingUpdate: {
                maxUnavailable: 0,
                maxSurge: 1,
            },
        },
    },
};

const serviceTemplate: Service = {
    kind: "Service",
    apiVersion: "v1",
    metadata: {
        name: "spring-rest",
        namespace: "default",
        labels: {
            service: "spring-rest",
            ns: "default",
        },
    },
    spec: {
        ports: [
            {
                protocol: "TCP",
                port: 8080,
                targetPort: "http",
            },
        ],
        selector: {
            app: "spring-rest",
            ns: "default",
        },
        sessionAffinity: "None",
        type: "NodePort",
    },
};
/*
function getConfigAndUpsert(ns: string, name: string, image: string): Promise<void> {
    let config: k8.ClusterConfiguration | k8.ClientConfiguration;
    const cfgPath = path.join(appRoot.path, "..", "creds", "kube", "config");
    try {
        const kubeconfig = k8.config.loadKubeconfig(cfgPath);
        config = k8.config.fromKubeconfig(kubeconfig);
    } catch (e) {
        logger.info(`failed to load ${cfgPath}: ${e.message}`);
        try {
            config = k8.config.getInCluster();
        } catch (er) {
            logger.info(`failed to load in-cluster-config: ${er.message}`);
            return Promise.reject(preErrMsg(er, "failed to load both kubeconfig and in-cluster-config"));
        }
    }
    return upsertDeployment(config, ns, name, image);
}

const d = (process.argv.length > 2) ? process.argv[2] : "sleep";
const n = (process.argv.length > 3) ? process.argv[3] : "atomist";
const i = (process.argv.length > 4) ? process.argv[4] : "atomist/sleep:0.1.0";
getConfigAndUpsert(n, d, i)
    .then(() => process.exit(0))
    .catch(e => {
        logger.error(`failed to upsert: ${e.message}`);
        process.exit(1);
    });
*/
