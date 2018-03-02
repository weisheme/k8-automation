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

import { HandlerResult, logger } from "@atomist/automation-client";
import * as appRoot from "app-root-path";
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as path from "path";

import { webhookBaseUrl } from "./atomistWebhook";
import { preErrMsg, reduceResults } from "./error";

/**
 * Information needed to create, update, or delete a deployment
 * in/from a kubernetes cluster.
 */
export interface DeploymentRequest {
    /** Kubernetes Core client */
    core: k8.ApiGroup;
    /** Kubernetes Extension client */
    ext: k8.ApiGroup;
    /** owner of repository */
    owner: string;
    /** name of repository, used as deployment/service name */
    repo: string;
    /** Atomist team ID */
    teamId: string;
    /** image tag for deployment pod template container */
    image: string;
    /** deployment environment, e.g., "production" or "testing" */
    env: string;
}

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

export type NamespaceRequest = Pick<DeploymentRequest, "teamId" | "env">;

/**
 * Generated kubernetes namespace for a deployment.
 *
 * @param req namespace request object
 * @return kubernetes namespace to create resource in
 */
function getNamespace(req: NamespaceRequest): string {
    return cleanName(`${req.teamId}${joinString}${req.env}`);
}

export type NameRequest = Pick<DeploymentRequest, "owner" | "repo">;

/**
 * Generate resource name for a deployment.
 *
 * @param req deployment request object
 * @return resource name
 */
function resourceName(req: NameRequest): string {
    return cleanName(`${req.owner}${joinString}${req.repo}`);
}

/**
 * Information needed to upsert a deployment in a kubernetes cluster.
 */
export interface UpsertDeploymentRequest {
    /** Kubernetes cluster or client configuration */
    config: k8.ClusterConfiguration | k8.ClientConfiguration;
    /** owner of repository */
    owner: string;
    /** name of repository, used as deployment/service name */
    repo: string;
    /** Atomist team ID */
    teamId: string;
    /** image tag for deployment pod template container */
    image: string;
    /** deployment environment, e.g., "production" or "testing" */
    env: string;
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
    const req: DeploymentRequest = { core, ext, owner, repo, teamId, image, env };
    const ns = getNamespace(req);
    const name = resourceName(req);

    return ext.namespaces(ns).deployments(name).get()
        .then(dep => {
            logger.debug(`updating deployment ${ns}/${name} using ${image}`);
            return updateDeployment(ext, dep, image);
        }, e => {
            logger.debug(`failed to get ${ns}/${name} deployment, creating using ${image}: ${e.message}`);
            return createDeployment(req);
        })
        .catch(e => Promise.reject(preErrMsg(e, `upserting ${ns}/${name} using ${image} failed`)));
}

/**
 * Delete a deployment, its service, and ingress rules from a
 * kubernetes cluster.
 *
 * @param req delete deployment request object
 */
export function deleteDeployment(
    config: k8.ClusterConfiguration | k8.ClientConfiguration,
    owner: string,
    repo: string,
    teamId: string,
    env: string = "production",
): Promise<void> {
    const core = new k8.Core(config);
    const ext = new k8.Extensions(config);
    const req = { core, ext, owner, repo, teamId, env };
    const name = resourceName(req);
    const ns = getNamespace(req);
    const depStr = stringify({ owner, repo, teamId, env });
    const updateIngress: Promise<HandlerResult> = ext.namespaces(ns).ingresses(ingressName).get()
        .then((ing: Ingress) => {
            const patch: Partial<Ingress> = ingressRemove(ing, req);
            if (patch.spec.rules[0].http.paths.length < 1) {
                return ext.namespaces(ns).ingresses(ingressName).delete({})
                    .catch(e => Promise.reject(preErrMsg(e, `failed to delete ingress`)));
            }
            return ext.namespaces(ns).ingresses(ingressName).patch({ body: patch })
                .catch(e => Promise.reject(preErrMsg(e, `failed to remove path from ingress`)));
        }, e => logger.debug(`no ingress found for '${depStr}': ${e.message}`))
        .then(() => ({ code: 0 }), e => ({ code: 1, message: e.message }));
    const rmService: Promise<HandlerResult> = core.namespaces(ns).services(name).get()
        .then((svc: Service) => {
            return core.namespaces(ns).services(name).delete({})
                .catch(e => Promise.reject(preErrMsg(e, `failed to delete service`)));
        }, e => logger.debug(`no service found for '${depStr}': ${e.message}`))
        .then(() => ({ code: 0 }), e => ({ code: 1, message: e.message }));
    const rmDeployment: Promise<HandlerResult> = ext.namespaces(ns).deployments(name).get()
        .then((dep: Deployment) => {
            return ext.namespaces(ns).deployments(name).delete({ body: { propagationPolicy: "Background" } })
                .catch(e => Promise.reject(preErrMsg(e, `failed to delete deployment`)));
        }, e => logger.debug(`no deployment found for '${depStr}': ${e.message}`))
        .then(() => ({ code: 0 }), e => ({ code: 1, message: e.message }));
    return Promise.all([updateIngress, rmService, rmDeployment])
        .then(results => {
            const acc = reduceResults(results);
            if (acc.code > 0) {
                return Promise.reject(new Error(`failed to delete some resources of '${depStr}': ${acc.message}`));
            }
            return;
        });
}

export interface Metadata {
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

export interface Namespace {
    apiVersion: "v1";
    kind: "Namespace";
    metadata: Metadata;
}

export interface MatchSelector {
    matchLabels?: {
        [key: string]: string;
    };
    matchExpressions?: string[];
}

export interface Selector {
    [key: string]: string;
}

export interface HttpHeader {
    name: string;
    value: string;
}

export type UriScheme = "HTTP" | "HTTPS";

export interface Probe {
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

export type Protocol = "TCP" | "UDP";

export interface ContainerPort {
    name?: string;
    hostPort?: number;
    containerPort: number;
    protocol?: Protocol;
    hostIP?: string;
}

export interface ObjectFieldSelector {
    apiVersion?: string;
    fieldPath: string;
}

export interface ResourceFieldSelector {
    containerName?: string;
    resource: string;
    divisor?: string;
}

export interface ConfigMapKeySelector {
    name?: string;
    key: string;
    optional: boolean;
}

export interface SecretKeySelector {
    name?: string;
    key: string;
    optional?: boolean;
}

export interface EnvVarSource {
    fieldRef?: ObjectFieldSelector;
    resourceFieldRef?: ResourceFieldSelector;
    configMapKeyRef?: ConfigMapKeySelector;
    secretKeyRef?: SecretKeySelector;
}

export interface EnvVar {
    name: string;
    value?: string;
    valueFrom?: EnvVarSource;
}

export interface Resource {
    cpu?: string | number;
    memory?: string | number;
}

export interface ResourceRequirements {
    limits?: Resource;
    requests?: Resource;
}

export interface VolumeMount {
    name: string;
    readOnly?: boolean;
    mountPath: string;
    subPath?: string;
}

export interface VolumeDevice {
    name: string;
    devicePath: string;
}

export type PullPolicy = "Always" | "IfNotPresent" | "Never";

export type TerminationMessagePolicy = "File" | "FallbackToLogsOnError";

export interface Container {
    name: string;
    image?: string;
    command?: string[];
    args?: string[];
    workingDir?: string;
    ports?: ContainerPort[];
    env?: EnvVar[];
    resources?: ResourceRequirements;
    volumeMounts?: VolumeMount[];
    volumeDevices?: VolumeDevice[];
    livenessProbe?: Probe;
    readinessProbe?: Probe;
    terminationMessagePath?: string;
    terminationMessagePolicy?: TerminationMessagePolicy;
    imagePullPolicy?: PullPolicy;
    // securityContext?: SecurityContext;
    stdin?: boolean;
    stdinOnce?: boolean;
    tty?: boolean;
}

export type RestartPolicy = "Always" | "OnFailure" | "Never";

export type DNSPolicy = "ClusterFirstWithHostNet" | "ClusterFirst" | "Default" | "None";

export interface PodSpec {
    initContainers?: Container[];
    containers: Container[];
    restartPolicy?: RestartPolicy;
    terminationGracePeriodSeconds?: number;
    activeDeadlineSeconds?: number;
    dnsPolicy?: DNSPolicy;
    nodeSelector?: { [key: string]: string };
    serviceAccountName?: string;
    automountServiceAccountToken?: boolean;
}

export interface PodTemplate {
    metadata?: Metadata;
    spec?: PodSpec;
}

export interface Deployment {
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

export interface ServicePort {
    name?: string;
    protocol?: Protocol;
    port: number;
    targetPort?: number | string;
    nodePort?: number;
}

export interface SessionAffinityConfig {
    clientIP?: {
        timeoutSeconds?: number;
    };
}

export interface ServiceSpec {
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

export interface LoadBalancerIngress {
    ip?: string;
    hostname?: string;
}

export interface LoadBalancerStatus {
    ingress?: LoadBalancerIngress[];
}

export interface ServiceStatus {
    loadBalancer?: LoadBalancerStatus;
}

export interface Service {
    kind: "Service";
    apiVersion: "v1";
    metadata?: Metadata;
    spec?: ServiceSpec;
    status?: ServiceStatus;
}

export interface ObjectReference {
    kind?: string;
    namespace?: string;
    name?: string;
    uid?: string;
    apiVersion?: string;
    resourceVersion?: string;
    fieldPath?: string;
}

export interface EndpointAddress {
    ip: string;
    hostname?: string;
    nodeName?: string;
    targetRef?: ObjectReference;
}

export interface EndpointPort {
    name?: string;
    port: number;
    protocol?: Protocol;
}

export interface EndpointSubset {
    addresses?: EndpointAddress[];
    notReadyAddresses?: EndpointAddress[];
    ports?: EndpointPort[];
}

export interface Endpoints {
    kind: "Endpoints";
    apiVersion: "v1";
    metadata?: Metadata;
    subsets: EndpointSubset[];
}

export interface IngressBackend {
    serviceName: string;
    servicePort: string | number;
}

export interface IngressTLS {
    hosts?: string[];
    secretName?: string;
}

export interface HTTPIngressPath {
    path?: string;
    backend: IngressBackend;
}

export interface HTTPIngressRuleValue {
    paths: HTTPIngressPath[];
}

export interface IngressRule {
    host?: string;
    http?: HTTPIngressRuleValue;
}

export interface IngressSpec {
    backend?: IngressBackend;
    tls?: IngressTLS;
    rules?: IngressRule[];
}

export interface IngressStatus {
    loadBalancer?: LoadBalancerStatus;
}

export interface Ingress {
    kind: "Ingress";
    apiVersion: "extensions/v1beta1";
    metadata?: Metadata;
    spec?: IngressSpec;
    status?: IngressStatus;
}

/**
 * Update the image of the first container in a deployment pod template.
 *
 * @param ext Kubernetes extension API client
 * @param dep current deployment spec
 * @param image new image tagname
 * @return updated deployment spec
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
 * @param req deployment request
 * @return created deployment spec
 */
function createDeployment(req: DeploymentRequest): Promise<any> {
    const name = resourceName(req);
    const space: Namespace = namespaceTemplate(req);
    const ns = space.metadata.name;
    const svc: Service = serviceTemplate(req);
    const dep: Deployment = deploymentTemplate(req);
    return req.core.namespaces(ns).get()
        .catch(e => {
            logger.debug(`failed to get namespace ${ns}, creating it: ${e.message}`);
            return req.core.namespaces.post({ body: space })
                .catch(er => Promise.reject(preErrMsg(er, `failed to create namespace ${stringify(space)}`)));
        })
        .then(() => req.core.namespaces(ns).services.post({ body: svc })
            .catch(e => Promise.reject(preErrMsg(e, `failed to create service: ${stringify(svc)}`))))
        .then(() => req.ext.namespaces(ns).deployments.post({ body: dep })
            .catch(e => Promise.reject(preErrMsg(e, `failed to create deployment: ${stringify(dep)}`))))
        .then(() => req.ext.namespaces(ns).ingresses(ingressName).get())
        .then((ing: Ingress) => {
            const patch: Partial<Ingress> = ingressPatch(ing, req);
            return req.ext.namespaces(ns).ingresses(ingressName).patch({ body: patch })
                .catch(e => Promise.reject(preErrMsg(e, `failed to patch ingress: ${ing}+${stringify(patch)}`)));
        }, e => {
            logger.debug(`failed to get ingress in namespace ${ns}, creating: ${e.message}`);
            const ing = ingressTemplate(req);
            return req.ext.namespaces(ns).ingresses.post({ body: ing })
                .catch(er => Promise.reject(preErrMsg(e, `failed to create ingress: ${ing}`)));
        });
}

const creator = `atomist.k8-automation`;

/**
 * Create namespace resource.
 *
 * @param req namespace request
 * @return kubernetes namespace resource
 */
export function namespaceTemplate(req: NamespaceRequest): Namespace {
    const name = getNamespace(req);
    const ns: Namespace = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name,
        },
    };
    return ns;
}

export type DeploymentTemplateRequest = Pick<DeploymentRequest, "owner" | "repo" | "teamId" | "image" | "env">;

/**
 * Create deployment for a repo and image.
 *
 * @param req deployment template request
 * @return deployment resource
 */
export function deploymentTemplate(req: DeploymentTemplateRequest): Deployment {
    const name = resourceName(req);
    const baseImage = req.image.split(":")[0];
    const k8ventAnnot = stringify({
        environment: req.env,
        webhooks: [`${webhookBaseUrl()}/atomist/kube/teams/${req.teamId}`],
    });
    const repoImageAnnot = stringify([
        {
            container: name,
            repo: {
                owner: req.owner,
                name: req.repo,
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
                app: req.repo,
                owner: req.owner,
                teamId: req.teamId,
                creator,
            },
        },
        spec: {
            replicas: 1,
            revisionHistoryLimit: 3,
            selector: {
                matchLabels: {
                    app: req.repo,
                    owner: req.owner,
                    teamId: req.teamId,
                },
            },
            template: {
                metadata: {
                    name,
                    labels: {
                        app: req.repo,
                        owner: req.owner,
                        teamId: req.teamId,
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
                            image: req.image,
                            imagePullPolicy: "IfNotPresent",
                            env: [
                                {
                                    name: "ATOMIST_ENVIRONMENT",
                                    value: req.env,
                                },
                            ],
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
                                initialDelaySeconds: 30,
                                timeoutSeconds: 3,
                                periodSeconds: 10,
                                successThreshold: 1,
                                failureThreshold: 6,
                            },
                            livenessProbe: {
                                httpGet: {
                                    path: "/health",
                                    port: "http",
                                    scheme: "HTTP",
                                },
                                initialDelaySeconds: 30,
                                timeoutSeconds: 3,
                                periodSeconds: 10,
                                successThreshold: 1,
                                failureThreshold: 6,
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
                    dnsPolicy: "ClusterFirst",
                    restartPolicy: "Always",
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

export type ServiceTemplateRequest = Pick<DeploymentRequest, "owner" | "repo" | "teamId">;

/**
 * Create service to front a deployment for a repo and image.
 *
 * @param req service template request
 * @return service resource
 */
export function serviceTemplate(req: ServiceTemplateRequest): Service {
    const name = resourceName(req);
    const s: Service = {
        kind: "Service",
        apiVersion: "v1",
        metadata: {
            name,
            labels: {
                service: req.repo,
                owner: req.owner,
                teamId: req.teamId,
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
                app: req.repo,
                owner: req.owner,
                teamId: req.teamId,
            },
            sessionAffinity: "None",
            type: "NodePort",
        },
    };
    return s;
}

const ingressName = "atm-gke-ri";
const hostDns = "sdm.atomist.io";

export type IngressRequest = Pick<DeploymentRequest, "owner" | "repo" | "teamId" | "env">;

/**
 * Create the ingress path for a deployment.
 *
 * @param req ingress request
 * @return ingress path for deployment service
 */
export function ingressPath(req: IngressRequest): string {
    return `/${req.teamId}/${req.env}/${req.owner}/${req.repo}`;
}

/**
 * Create the URL for a deployment.
 *
 * @param req ingress request
 * @return ingress path for deployment service
 */
export function ingressBaseUrl(req: IngressRequest): string {
    return `http://${hostDns}${ingressPath(req)}/`;
}

/**
 * Create a ingress HTTP path.
 *
 * @param req ingress request
 * @return ingress patch
 */
function httpIngressPath(req: IngressRequest): HTTPIngressPath {
    const name = resourceName(req);
    const inPath = ingressPath(req);
    const httpPath: HTTPIngressPath = {
        path: inPath,
        backend: {
            serviceName: name,
            servicePort: 8080,
        },
    };
    return httpPath;
}

/**
 * Create the ingress for a deployment namespace.
 *
 * @param req ingress request
 * @return service resource for ingress to use
 */
export function ingressTemplate(req: IngressRequest): Ingress {
    const httpPath: HTTPIngressPath = httpIngressPath(req);
    const i: Ingress = {
        kind: "Ingress",
        apiVersion: "extensions/v1beta1",
        metadata: {
            name: ingressName,
            annotations: {
                "kubernetes.io/ingress.class": "nginx",
                "nginx.ingress.kubernetes.io/rewrite-target": "/",
            },
            labels: {
                ingress: "nginx",
                teamId: req.teamId,
                env: req.env,
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
 * @param req ingress request
 * @return ingress patch
 */
export function ingressPatch(ing: Ingress, req: IngressRequest): Partial<Ingress> {
    const httpPath: HTTPIngressPath = httpIngressPath(req);
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

/**
 * Create a patch to remove a path from the ingress rules.
 *
 * @param ing ingress resource to create patch for
 * @param req ingress request
 * @return ingress patch that removes the path
 */
export function ingressRemove(ing: Ingress, req: IngressRequest): Partial<Ingress> {
    const rules = ing.spec.rules;
    if (!rules || rules.length < 1) {
        logger.debug(`requested to remove path from ingress with no rules: ${stringify(ing)}`);
        return undefined;
    }
    const iPath = ingressPath(req);
    const paths = rules[0].http.paths.filter(p => p.path !== iPath);
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
