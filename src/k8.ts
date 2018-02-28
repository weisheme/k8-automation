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
import * as appRoot from "app-root-path";
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as path from "path";

import { webhookBaseUrl } from "./atomistWebhook";
import { preErrMsg } from "./error";

const joinString = "-0-";

/**
 * Kubernetes has rules about what can be in a name, specifically they
 * must conform to this regular expression
 * /[a-z]([-a-z0-9]*[a-z0-9])?/.  This enforces conformance.  Any
 * modification like this may result in name collisions.
 *
 * @param name name to clean
 * @return cleaned name
 */
function cleanName(name: string): string {
    return "r" + name.toLocaleLowerCase().replace(/[^a-z0-9\-]+/g, joinString) + "9";
}

/**
 * Generated kubernetes namespace from repo owner and Atomist team ID.
 *
 * @param owner repository owner, i.e., organization or user
 * @param teamId Atomist team ID
 * @param env deployment environment, e.g., "production" or "testing"
 * @return kubernetes namespace to create resource in
 */
function getNamespace(owner: string, teamId: string, env: string): string {
    return cleanName(`${teamId}${joinString}${env}`);
}

/**
 * Generate resource name from repo name and owner.
 *
 * @param owner repository owner, i.e., organization or user
 * @param repo repository name, used as name of deployment/service
 */
function resourceName(owner: string, repo: string): string {
    return cleanName(`${owner}${joinString}${repo}`);
}

/**
 * Create or update a deployment.
 *
 * @param config a kubernetes ClusterConfiguration or ClientConfiguration
 * @param owner repository owner, i.e., organization or user
 * @param repo repository name, used as name of deployment/service
 * @param teamId Atomist team ID
 * @param image full Docker tag of image, i.e., [REPO/]OWNER/NAME:TAG
 * @param env deployment environment, e.g., "production" or "testing"
 * @return Promise
 */
export function upsertDeployment(
    config: k8.ClusterConfiguration | k8.ClientConfiguration,
    owner: string,
    repo: string,
    teamId: string,
    image: string,
    env: string = "production",
): Promise<void> {

    const core = new k8.Core(config);
    const ext = new k8.Extensions(config);
    const ns = getNamespace(owner, teamId, env);
    const name = resourceName(owner, repo);

    return ext.namespaces(ns).deployments(name).get()
        .then(dep => {
            logger.debug(`updating deployment ${ns}/${name} using ${image}`);
            return updateDeployment(ext, dep, image);
        }, e => {
            logger.debug(`failed to get ${ns}/${name} deployment, creating using ${image}: ${e.message}`);
            return createDeployment(core, ext, owner, repo, teamId, image, env);
        })
        .catch(e => Promise.reject(preErrMsg(e, `upserting ${ns}/${name} using ${image} failed`)));
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

interface ServiceSpec {
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
}

interface LoadBalancerIngress {
    ip?: string;
    hostname?: string;
}

interface LoadBalancerStatus {
    ingress?: LoadBalancerIngress[];
}

interface ServiceStatus {
    loadBalancer?: LoadBalancerStatus;
}

interface Service {
    kind: "Service";
    apiVersion: "v1";
    metadata?: Metadata;
    spec?: ServiceSpec;
    status?: ServiceStatus;
}

interface ObjectReference {
    kind?: string;
    namespace?: string;
    name?: string;
    uid?: string;
    apiVersion?: string;
    resourceVersion?: string;
    fieldPath?: string;
}

interface EndpointAddress {
    ip: string;
    hostname?: string;
    nodeName?: string;
    targetRef?: ObjectReference;
}

interface EndpointPort {
    name?: string;
    port: number;
    protocol?: Protocol;
}

interface EndpointSubset {
    addresses?: EndpointAddress[];
    notReadyAddresses?: EndpointAddress[];
    ports?: EndpointPort[];
}

interface Endpoints {
    kind: "Endpoints";
    apiVersion: "v1";
    metadata?: Metadata;
    subsets: EndpointSubset[];
}

interface IngressBackend {
    serviceName: string;
    servicePort: string | number;
}

interface IngressTLS {
    hosts?: string[];
    secretName?: string;
}

interface HTTPIngressPath {
    path?: string;
    backend: IngressBackend;
}

interface HTTPIngressRuleValue {
    paths: HTTPIngressPath[];
}

interface IngressRule {
    host?: string;
    http?: HTTPIngressRuleValue;
}

interface IngressSpec {
    backend?: IngressBackend;
    tls?: IngressTLS;
    rules?: IngressRule[];
}

interface IngressStatus {
    loadBalancer?: LoadBalancerStatus;
}

interface Ingress {
    kind: "Ingress";
    apiVersion: "extensions/v1beta1";
    metadata?: Metadata;
    spec?: IngressSpec;
    status?: IngressStatus;
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
 * @param owner owner of repository
 * @param repo name of repository, used as deployment/service name
 * @param teamId Atomist team ID
 * @param image image tag for deployment pod template container
 * @param env deployment environment, e.g., "production" or "testing"
 * @return created deployment spec
 */
function createDeployment(
    core: k8.ApiGroup,
    ext: k8.ApiGroup,
    owner: string,
    repo: string,
    teamId: string,
    image: string,
    env: string,
): Promise<any> {

    const name = resourceName(owner, repo);
    const space: Namespace = namespaceTemplate(owner, teamId, env);
    const ns = space.metadata.name;
    const svc: Service = serviceTemplate(name, owner, repo, teamId);
    const dep: Deployment = deploymentTemplate(name, owner, repo, teamId, image, env);
    return core.namespaces(ns).get()
        .catch(e => {
            logger.debug(`failed to get namespace ${ns}, creating it: ${e.message}`);
            return core.namespaces.post({ body: space })
                .catch(er => Promise.reject(preErrMsg(er, `failed to create namespace ${stringify(space)}`)));
        })
        .then(() => core.namespaces(ns).services.post({ body: svc })
            .catch(e => Promise.reject(preErrMsg(e, `failed to create service: ${stringify(svc)}`))))
        .then(() => ext.namespaces(ns).deployments.post({ body: dep })
            .catch(e => Promise.reject(preErrMsg(e, `failed to create deployment: ${stringify(dep)}`))))
        .then(() => ext.namespaces(ns).ingresses(ingressName).get())
        .then((ing: Ingress) => {
            const patch: Partial<Ingress> = ingressPatch(ing, name, owner, repo, teamId, env);
            return ext.namespaces(ns).ingresses(ingressName).patch({ body: patch })
                .catch(e => Promise.reject(preErrMsg(e, `failed to patch ingress: ${ing}+${stringify(patch)}`)));
        }, e => {
            logger.debug(`failed to get ingress in namespace ${ns}, creating: ${e.message}`);
            const ing = ingressTemplate(ns, name, owner, repo, teamId, env);
            return ext.namespaces(ns).ingresses.post({ body: ing })
                .catch(er => Promise.reject(preErrMsg(e, `failed to create ingress: ${ing}`)));
        });
}

const creator = `atomist.k8-automation`;

/**
 * Create namespace resource.
 *
 * @param owner repository owner, i.e., organization or user
 * @param teamId Atomist team ID
 * @param env deployment environment, e.g., "production" or "testing"
 * @return kubernetes namespace resource
 */
function namespaceTemplate(owner: string, teamId: string, env: string): Namespace {
    const name = getNamespace(owner, teamId, env);
    const ns: Namespace = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name,
        },
    };
    return ns;
}

/**
 * Create deployment for a repo and image.
 *
 * @param name deployment name
 * @param owner repository owner, i.e., organization or user
 * @param repo name of repository
 * @param teamId Atomist team ID
 * @param image full Docker image tag, i.e., [REGISTRY/]OWNER/NAME:VERSION
 * @param env deployment environment, e.g., "production" or "testing"
 * @return deployment resource
 */
function deploymentTemplate(
    name: string,
    owner: string,
    repo: string,
    teamId: string,
    image: string,
    env: string,
): Deployment {

    const baseImage = image.split(":")[0];
    const k8ventAnnot = stringify({
        environment: env,
        webhooks: [
            `${webhookBaseUrl()}/atomist/kube/teams/${teamId}`,
        ],
    });
    const repoImageAnnot = stringify([
        {
            container: name,
            repo: {
                owner,
                name: repo,
            },
            image: baseImage,
        },
    ]);
    const d: Deployment = {
        apiVersion: "extensions/v1beta1",
        kind: "Deployment",
        metadata: {
            name,
            labels: {
                app: repo,
                owner,
                teamId,
                creator,
            },
        },
        spec: {
            replicas: 1,
            revisionHistoryLimit: 3,
            selector: {
                matchLabels: {
                    app: repo,
                    owner,
                    teamId,
                },
            },
            template: {
                metadata: {
                    name,
                    labels: {
                        app: repo,
                        owner,
                        teamId,
                        creator,
                    },
                    annotations: {
                        "atomist.com/k8vent": k8ventAnnot,
                        "atomist.com/repo-image": repoImageAnnot,
                    },
                },
                spec: {
                    containers: [
                        {
                            name,
                            image,
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
    return d;
}

/**
 * Create service to front a deployment for a repo and image.
 *
 * @param name service name
 * @param owner repository owner, i.e., organization or user
 * @param repo name of repository
 * @param teamId Atomist team ID
 * @return service resource
 */
function serviceTemplate(name: string, owner: string, repo: string, teamId: string): Service {
    const s: Service = {
        kind: "Service",
        apiVersion: "v1",
        metadata: {
            name,
            labels: {
                service: repo,
                owner,
                teamId,
                creator,
            },
        },
        spec: {
            ports: [
                {
                    name: "http",
                    protocol: "TCP",
                    port: 8080,
                    targetPort: "http",
                },
            ],
            selector: {
                app: repo,
                owner,
                teamId,
            },
            sessionAffinity: "None",
            type: "NodePort",
        },
    };
    return s;
}

const ingressName = "atm-gke-ri";
const hostDns = "sdm.atomist.com";

/**
 * Create the ingress path for a deployment.
 *
 * @param owner repository owner, i.e., organization or user
 * @param repo name of repository
 * @param teamId Atomist team ID
 * @param env deployment environment, e.g., "production" or "testing"
 * @return ingress path for deployment service
 */
export function ingressPath(owner: string, repo: string, teamId: string, env: string): string {
    return `/${teamId}/${env}/${owner}/${repo}`;
}

export function ingressBaseUrl(owner: string, repo: string, teamId: string, env: string): string {
    return `http://${hostDns}${ingressPath(owner, repo, teamId, env)}/`;
}

/**
 * Create a ingress HTTP path.
 *
 * @param service name of ingress service
 * @param owner repository owner, i.e., organization or user
 * @param repo name of repository
 * @param teamId Atomist team ID
 * @param env deployment environment, e.g., "production" or "testing"
 * @return ingress patch
 */
function httpIngressPath(
    service: string,
    owner: string,
    repo: string,
    teamId: string,
    env: string,
): HTTPIngressPath {

    const inPath = ingressPath(owner, repo, teamId, env);
    const httpPath: HTTPIngressPath = {
        path: inPath,
        backend: {
            serviceName: service,
            servicePort: 8080,
        },
    };
    return httpPath;
}

/**
 * Create the ingress for a namespace.
 *
 * @param ns namespace to create ingress in
 * @param teamId Atomist team ID
 * @param env deployment environment, e.g., "production" or "testing"
 * @return service resource for ingress to use
 */
function ingressTemplate(
    ns: string,
    service: string,
    owner: string,
    repo: string,
    teamId: string,
    env: string,
): Ingress {

    const httpPath: HTTPIngressPath = httpIngressPath(service, owner, repo, teamId, env);
    const i: Ingress = {
        kind: "Ingress",
        apiVersion: "extensions/v1beta1",
        metadata: {
            name: ingressName,
            namespace: ns,
            annotations: {
                "kubernetes.io/ingress.class": "nginx",
                "nginx.ingress.kubernetes.io/rewrite-target": "/",
            },
            labels: {
                ingress: "nginx",
                teamId,
                env,
                creator,
            },
        },
        spec: {
            rules: [
                {
                    host: hostDns,
                    http: {
                        paths: [httpPath],
                    },
                },
            ],
        },
    };
    return i;
}

/**
 * Create a patch to add a new path to the ingress rules.
 *
 * @param ing ingress resource to create patch for
 * @param service name of ingress service
 * @param owner repository owner, i.e., organization or user
 * @param repo name of repository
 * @param teamId Atomist team ID
 * @param env deployment environment, e.g., "production" or "testing"
 * @return ingress patch
 */
function ingressPatch(
    ing: Ingress,
    service: string,
    owner: string,
    repo: string,
    teamId: string,
    env: string,
): Partial<Ingress> {

    const httpPath: HTTPIngressPath = httpIngressPath(service, owner, repo, teamId, env);
    const rules = ing.spec.rules;
    const paths = (rules && rules.length > 0) ? [...ing.spec.rules[0].http.paths, httpPath] : [httpPath];
    const patch: Partial<Ingress> = {
        spec: {
            rules: [
                {
                    host: hostDns,
                    http: {
                        paths,
                    },
                },
            ],
        },
    };
    return patch;
}
