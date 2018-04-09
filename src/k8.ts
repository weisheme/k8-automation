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
    HandlerResult,
    logger,
    Success,
} from "@atomist/automation-client";
import * as appRoot from "app-root-path";
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import * as _ from "lodash";
import * as path from "path";
import promiseRetry = require("promise-retry");

import { preErrMsg } from "./error";

/**
 * Kubernetes configuration to use to create API clients.
 */
export interface KubeConfig {
    /** Kubernetes cluster or client configuration */
    config: k8.ClusterConfiguration | k8.ClientConfiguration;
}

/**
 * Kubernetes API clients used to create/update/delete an application.
 */
export interface KubeClients {
    /** Kubernetes Core client */
    core: k8.ApiGroup;
    /** Kubernetes Extension client */
    ext: k8.ApiGroup;
}

/**
 * Information needed to construct resources required for creating or
 * updating an application in a Kubernetes cluster.
 */
export interface KubeApplication {
    /** Atomist team ID */
    teamId: string;
    /** Arbitrary name of environment */
    env: string;
    /** Name of resources to create */
    name: string;
    /** Namespace to create resources in */
    ns: string;
    /** Full image tag for deployment pod template container */
    image: string;
    /**
     * Name of image pull secret for container image, if not provided
     * no image pull secret is provided in the pod spec.
     */
    imagePullSecret?: string;
    /**
     * Port the service listens on, if not provided no service
     * resource is created.
     */
    port?: number;
    /**
     * Ingress rule URL path, if not provided no ingress rule is
     * added.
     */
    path?: string;
    /**
     * Ingress rule hostname, if not provided none is used in the
     * ingress rule, meaning it will apply to the wildcard host, and
     * "localhost" is used when constructing the service endpoint URL.
     */
    host?: string;
    /** Ingress protocol, "http" or "https", default is "http" */
    protocol?: "http" | "https";
    /**
     * Stringified patch of a deployment spec for this application
     * that is parsed and overlaid on top of the default deployment
     * spec template.
     */
    deploymentSpec?: string;
    /**
     * Stringified patch of a service spec for this application that
     * is parsed and overlaid on top of the default service spec
     * template.
     */
    serviceSpec?: string;
}

/**
 * Information needed to delete resources related to an application in
 * a Kubernetes cluster.
 */
export type KubeDelete = Pick<KubeApplication, "name" | "ns" | "path" | "host">;

/**
 * Information needed to create an application in a Kubernetes
 * cluster.
 */
export type KubeApplicationRequest = KubeConfig & KubeApplication;

/**
 * Information needed to delete an application from a Kubernetes
 * cluster.
 */
export type KubeDeleteRequest = KubeConfig & KubeDelete;

/**
 * Internal application structure used to create or update resources
 * in a Kubernetes cluster.
 */
type KubeResourceRequest = KubeClients & KubeApplication;

/**
 * Internal application structure used to delete resources from a
 * Kubernetes cluster.
 */
type KubeDeleteResourceRequest = KubeClients & KubeDelete;

function reqFilter<T>(k: string, v: T): T {
    if (k === "config" || k === "core" || k === "ext") {
        return undefined;
    }
    return v;
}

/**
 * Create or update all the resources for an application in a
 * Kubernetes cluster if it does not exist.  If it does exist, update
 * the image in the deployment resource.
 *
 * @param req application creation request
 */
export async function upsertApplication(upReq: KubeApplicationRequest): Promise<void> {

    const core = new k8.Core(upReq.config);
    const ext = new k8.Extensions(upReq.config);
    const req = { ...upReq, core, ext };
    const reqStr = stringify(req, reqFilter);

    return upsertNamespace(req)
        .then(() => upsertService(req))
        .then(() => upsertDeployment(req))
        .then(() => upsertIngress(req))
        .catch(e => Promise.reject(preErrMsg(e, `upserting '${reqStr}' failed`)));
}

/**
 * Delete an application from a kubernetes cluster.  If any resource
 * requested to be deleted does not exist, it is logged but no error
 * is returned.
 *
 * @param req delete application request object
 */
export async function deleteApplication(delReq: KubeDeleteRequest): Promise<void> {
    const core = new k8.Core(delReq.config);
    const ext = new k8.Extensions(delReq.config);
    const req = { ...delReq, core, ext };
    const reqStr = stringify(req, reqFilter);
    const slug = `${req.ns}/${req.name}`;

    const errs: Error[] = [];
    return deleteIngress(req)
        .catch(e => errs.push(preErrMsg(e, `failed to remove rule for ${slug} from ingress`)))
        .then(() => deleteService(req))
        .catch(e => errs.push(preErrMsg(e, `failed to delete service ${slug}`)))
        .then(() => deleteDeployment(req))
        .catch(e => errs.push(preErrMsg(e, `failed to delete deployment ${slug}`)))
        .then(() => {
            if (errs.length > 0) {
                const msg = `Failed to delete application '${reqStr}': ${errs.map(e => e.message).join("; ")}`;
                logger.error(msg);
                return Promise.reject(new Error(msg));
            }
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

export interface LocalObjectReference {
    name?: string;
}

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
    imagePullSecrets?: LocalObjectReference[];
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
    tls?: IngressTLS[];
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
 * Create or update a namespace.
 *
 * @param req Kuberenetes application request
 */
async function upsertNamespace(req: KubeResourceRequest): Promise<void> {
    return req.core.namespaces(req.ns).get()
        .then(() => logger.debug(`Namespace ${req.ns} exists`), e => {
            logger.debug(`Failed to get namespace ${req.ns}, creating: ${e.message}`);
            const ns: Namespace = namespaceTemplate(req);
            return retryP(() => req.core.namespaces.post({ body: ns }), `Create namespace ${req.ns}`);
        });
}

/**
 * Create a service if it does not exist.  If req.port is false, no
 * service is created.
 *
 * @param req Kuberenetes application request
 */
async function upsertService(req: KubeResourceRequest): Promise<void> {
    const slug = `${req.ns}/${req.name}`;
    if (!req.port) {
        logger.debug(`Port not provided, will not create service ${slug}`);
        return Promise.resolve();
    }
    return req.core.namespaces(req.ns).services(req.name).get()
        .then(() => logger.debug(`Service ${slug} exists`), e => {
            logger.debug(`Failed to get service ${slug}, creating: ${e.message}`);
            let svc: Service;
            try {
                svc = serviceTemplate(req);
            } catch (e) {
                logger.error(e.message);
                return Promise.reject(e);
            }
            return retryP(() => req.core.namespaces(req.ns).services.post({ body: svc }), `create service ${slug}`);
        });
}

/**
 * Create or updated a deployment.
 *
 * @param req Kuberenetes application request
 */
async function upsertDeployment(req: KubeResourceRequest): Promise<void> {
    const slug = `${req.ns}/${req.name}`;
    return req.ext.namespaces(req.ns).deployments(req.name).get()
        .then(dep => {
            logger.debug(`Updating deployment ${slug} using ${req.image}`);
            const patch: Partial<Deployment> = {
                spec: {
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                },
                            ],
                        },
                    },
                },
            };
            return retryP(() => req.ext.namespaces(req.ns).deployments(req.name).patch({ body: patch }),
                `patch deployment ${slug}`);
        }, e => {
            logger.debug(`Failed to get deployment ${slug}, creating: ${e.message}`);
            let dep: Deployment;
            try {
                dep = deploymentTemplate(req);
            } catch (e) {
                logger.error(e.message);
                return Promise.reject(e);
            }
            return retryP(() => req.ext.namespaces(req.ns).deployments.post({ body: dep }),
                `create deployment ${slug}`);
        });
}

/**
 * Create or updated an ingress with the appropriate rule for an
 * application.
 *
 * @param req Kuberenetes resource request
 */
async function upsertIngress(req: KubeResourceRequest): Promise<void> {
    const slug = `${req.ns}/${req.name}`;
    if (!req.path) {
        logger.debug(`Path not provided, will not upsert ingress ${slug}`);
        return Promise.resolve();
    }
    return req.ext.namespaces(req.ns).ingresses(ingressName).get()
        .then((ing: Ingress) => {
            logger.debug(`Updating ingress ${ingressName} for ${slug}`);
            let patch: Partial<Ingress>;
            try {
                patch = ingressPatch(ing, req);
            } catch (e) {
                logger.error(e.message);
                return Promise.reject(e);
            }
            if (!patch) {
                logger.debug(`Ingress ${ingressName} does not need updating for ${slug}: ${stringify(ing)}`);
                return Promise.resolve();
            }
            return retryP(() => req.ext.namespaces(req.ns).ingresses(ingressName).patch({ body: patch }),
                `patch ingress ${req.ns}/${ingressName} for ${slug}`);
        }, e => {
            logger.debug(`Failed to get ingress ${req.ns}/${ingressName}, creating: ${e.message}`);
            const ing = ingressTemplate(req);
            return retryP(() => req.ext.namespaces(req.ns).ingresses.post({ body: ing }),
                `create ingress ${req.ns}/${ingressName} for ${slug}`);
        });
}

/**
 * Delete a service if it exists.  If the resource does not exist, do
 * nothing.
 *
 * @param req Kuberenetes delete request
 */
async function deleteService(req: KubeDeleteResourceRequest): Promise<void> {
    const slug = `${req.ns}/${req.name}`;
    return req.core.namespaces(req.ns).services(req.name).get()
        .then(() => {
            return retryP(() => req.core.namespaces(req.ns).services(req.name).delete({}), `delete service ${slug}`);
        }, e => logger.debug(`Service ${slug} does not exist: ${e.message}`));
}

/**
 * Delete a deployment if it exists.  If the resource does not exist,
 * do nothing.
 *
 * @param req Kuberenetes delete request
 */
async function deleteDeployment(req: KubeDeleteResourceRequest): Promise<void> {
    const slug = `${req.ns}/${req.name}`;
    return req.ext.namespaces(req.ns).deployments(req.name).get()
        .then(() => {
            const body = { propagationPolicy: "Background" };
            return retryP(() => req.ext.namespaces(req.ns).deployments(req.name).delete({ body }),
                `delete deployment ${slug}`);
        }, e => logger.debug(`Deployment ${slug} does not exist: ${e.message}`));
}

/**
 * Delete a rule from an ingress if it exists.  If the rule does not
 * exist, do nothing.  If it is the last rule to be deleted, the
 * ingress is deleted.
 *
 * @param req Kuberenetes delete request
 */
async function deleteIngress(req: KubeDeleteResourceRequest): Promise<void> {
    const slug = `${req.ns}/${req.name}`;
    if (!req.path) {
        logger.debug(`No path provided for ${slug}, cannot delete ingress rule`);
        return;
    }
    return retryP(() => req.ext.namespaces(req.ns).ingresses(ingressName).get(), "get ingress")
        .then((ing: Ingress) => {
            let patch: Partial<Ingress>;
            try {
                patch = ingressRemove(ing, req);
            } catch (e) {
                logger.error(e.message);
                return Promise.reject(e);
            }
            if (patch === undefined) {
                logger.debug(`No changes to ingress necessary for ${slug}`);
                return;
            } else if (patch === {}) {
                logger.debug(`Last rule removed from ingress ${req.ns}/${ingressName}, deleting ingress`);
                return retryP(() => req.ext.namespaces(req.ns).ingresses(ingressName).delete({}),
                    "delete ingress");
            }
            return retryP(() => req.ext.namespaces(req.ns).ingresses(ingressName).patch({ body: patch }),
                "remove path from ingress");
        }, e => logger.debug(`Ingress ${req.ns}/${ingressName} does not exist: ${e.message}`));
}

const creator = `atomist.k8-automation`;

function smartMerge<T, U>(objValue: T, srcValue: U): U {
    if (_.isArray(srcValue)) {
        return srcValue;
    }
}

/**
 * Create namespace resource.
 *
 * @param req Kubernetes application
 * @return kubernetes namespace resource
 */
export function namespaceTemplate(req: KubeApplication): Namespace {
    const ns: Namespace = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: req.ns,
        },
    };
    return ns;
}

/**
 * Create deployment for a repo and image.
 *
 * @param req deployment template request
 * @return deployment resource
 */
export function deploymentTemplate(req: KubeApplication): Deployment {
    const k8ventAnnot = stringify({
        environment: req.env,
        webhooks: [`${webhookBaseUrl()}/atomist/kube/teams/${req.teamId}`],
    });
    const imagePullSecrets: LocalObjectReference[] = (req.imagePullSecret) ? [{ name: req.imagePullSecret }] : [];
    let ports: ContainerPort[];
    let readinessProbe: Probe;
    let livenessProbe: Probe;
    if (req.port) {
        ports = [
            {
                name: "http",
                containerPort: req.port,
                protocol: "TCP",
            },
        ];
        const probe: Probe = {
            httpGet: {
                path: "/",
                port: "http",
                scheme: "HTTP",
            },
            initialDelaySeconds: 30,
            timeoutSeconds: 3,
            periodSeconds: 10,
            successThreshold: 1,
            failureThreshold: 3,
        };
        readinessProbe = probe;
        livenessProbe = probe;
    }
    const d: Deployment = {
        apiVersion: "extensions/v1beta1",
        kind: "Deployment",
        metadata: {
            name: req.name,
            labels: {
                app: req.name,
                teamId: req.teamId,
                env: req.env,
                creator,
            },
        },
        spec: {
            replicas: 1,
            revisionHistoryLimit: 3,
            selector: {
                matchLabels: {
                    app: req.name,
                    teamId: req.teamId,
                },
            },
            template: {
                metadata: {
                    name: req.name,
                    labels: {
                        app: req.name,
                        teamId: req.teamId,
                        env: req.env,
                        creator,
                    },
                    annotations: {
                        "atomist.com/k8vent": k8ventAnnot,
                    },
                },
                spec: {
                    containers: [
                        {
                            name: req.name,
                            image: req.image,
                            imagePullPolicy: "IfNotPresent",
                            env: [
                                {
                                    name: "ATOMIST_TEAMS",
                                    value: req.teamId,
                                },
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
                            readinessProbe,
                            livenessProbe,
                            ports,
                        },
                    ],
                    dnsPolicy: "ClusterFirst",
                    restartPolicy: "Always",
                    imagePullSecrets,
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
    if (req.deploymentSpec) {
        try {
            const depSpec: Partial<Deployment> = JSON.parse(req.deploymentSpec);
            _.mergeWith(d, depSpec, smartMerge);
        } catch (e) {
            throw new Error(`Failed to parse provided deployment spec as JSON: ${e.message}`);
        }
    }
    return d;
}

/**
 * Create service to front a deployment for a repo and image.
 *
 * @param req service template request
 * @return service resource
 */
export function serviceTemplate(req: KubeApplication): Service {
    const s: Service = {
        kind: "Service",
        apiVersion: "v1",
        metadata: {
            name: req.name,
            labels: {
                app: req.name,
                teamId: req.teamId,
                env: req.env,
                creator,
            },
        },
        spec: {
            ports: [
                {
                    name: "http",
                    protocol: "TCP",
                    port: req.port,
                    targetPort: "http",
                },
            ],
            selector: {
                app: req.name,
                teamId: req.teamId,
            },
            sessionAffinity: "None",
            type: "NodePort",
        },
    };
    if (req.serviceSpec) {
        try {
            const svcSpec: Partial<Service> = JSON.parse(req.serviceSpec);
            _.mergeWith(s, svcSpec, smartMerge);
        } catch (e) {
            throw new Error(`Failed to parse provided service spec as JSON: ${e.message}`);
        }
    }
    return s;
}

const ingressName = "atm-ingress";

/**
 * Create the URL for a deployment.
 *
 * @param req ingress request
 * @return endpoint URL for deployment service
 */
export function endpointBaseUrl(req: KubeApplication): string {
    const protocol = (req.protocol) ? req.protocol : "http";
    const host = (req.host) ? req.host : "localhost";
    const tail = (req.path) ? `${req.path}/` : "/";
    return `${protocol}://${host}${tail}`;
}

/**
 * Create a ingress HTTP path.
 *
 * @param req ingress request
 * @return ingress patch
 */
function httpIngressPath(req: KubeApplication): HTTPIngressPath {
    const httpPath: HTTPIngressPath = {
        path: req.path,
        backend: {
            serviceName: req.name,
            servicePort: "http",
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
export function ingressTemplate(req: KubeApplication): Ingress {
    const httpPath: HTTPIngressPath = httpIngressPath(req);
    const rule: IngressRule = {
        http: {
            paths: [httpPath],
        },
    };
    if (req.host) {
        rule.host = req.host;
    }
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
            rules: [rule],
        },
    };
    return i;
}

/**
 * Create a patch to add a new path to the ingress rules.  If there is
 * already a rule for the path/backend/host, it returns undefined.
 *
 * @param ing ingress resource to create patch for
 * @param req ingress request
 * @return ingress patch or undefined if no need to patch
 */
export function ingressPatch(ing: Ingress, req: KubeApplication): Partial<Ingress> {
    const httpPath: HTTPIngressPath = httpIngressPath(req);
    const rules = (ing && ing.spec && ing.spec.rules) ? ing.spec.rules : [];
    const ruleIndex = (req.host) ? rules.findIndex(r => r.host === req.host) : rules.findIndex(r => !r.host);
    if (ruleIndex < 0) {
        const rule: IngressRule = {
            http: {
                paths: [httpPath],
            },
        };
        if (req.host) {
            rule.host = req.host;
        }
        rules.push(rule);
    } else {
        const rule = rules[ruleIndex];
        const paths = (rule && rule.http && rule.http.paths) ? rule.http.paths : [];
        const existingPath = paths.find(p => p.path === req.path);
        if (existingPath) {
            if (existingPath.backend.serviceName !== req.name) {
                throw new Error(`Cannot use path '${req.path}' for service ${req.ns}/${req.name}, it is already ` +
                    `in use by ${existingPath.backend.serviceName}`);
            }
            logger.debug(`Rule with path '${req.path}' and service ${req.ns}/${req.name} already exists`);
            return undefined;
        }
        paths.push(httpPath);
        rule.http.paths = paths;
        rules[ruleIndex] = rule;
    }
    const patch: Partial<Ingress> = { spec: { rules } };
    return patch;
}

/**
 * Create a patch to remove a path from the ingress rules.  If the
 * path does not exist, undefined is returned.  If the ingress has no
 * rules after removing this rule, an empty patch object is returned.
 *
 * @param ing ingress resource to create patch for
 * @param req ingress request
 * @return ingress patch that removes the path, or undefined if nothing needs done.
 */
export function ingressRemove(ing: Ingress, req: KubeDelete): Partial<Ingress> {
    if (!ing || !ing.spec || !ing.spec.rules || ing.spec.rules.length < 1) {
        return undefined;
    }
    const rules = ing.spec.rules;
    const ruleIndex = (req.host) ? rules.findIndex(r => r.host === req.host) : rules.findIndex(r => !r.host);
    if (ruleIndex < 0) {
        return undefined;
    }
    const rule = rules[ruleIndex];
    const paths = rule.http.paths;
    const pathIndex = paths.findIndex(p => p.path === req.path);
    if (pathIndex < 0) {
        return undefined;
    }
    const existingPath = paths[pathIndex];
    if (existingPath.backend.serviceName !== req.name) {
        throw new Error(`Will not remove path '${req.path}' for service ${req.ns}/${req.name}, it is associated ` +
            `with service ${existingPath.backend.serviceName}`);
    }
    rules[ruleIndex].http.paths.splice(pathIndex, 1);
    if (rules[ruleIndex].http.paths.length < 1) {
        rules.splice(ruleIndex, 1);
        if (rules.length < 1) {
            return {};
        }
    }
    const patch: Partial<Ingress> = { spec: { rules } };
    return patch;
}

const defaultRetryOptions = {
    retries: 5,
    factor: 2,
    minTimeout: 0.1 * 1000,
    maxTimeout: 3 * 1000,
    randomize: true,
};

/**
 * Retry Kube API call.
 */
async function retryP<T>(
    k: () => Promise<T>,
    desc: string,
    options = defaultRetryOptions,
): Promise<T> {

    return promiseRetry(defaultRetryOptions, (retry, count) => {
        logger.debug(`Retry ${desc} attempt ${count}`);
        return k().catch(e => {
            logger.debug(`Error ${desc} attempt ${count}: ${e.message}`);
            retry(e);
        });
    })
        .catch(e => Promise.reject(preErrMsg(e, `Failed to ${desc}`)));
}

/**
 * Scheme and hostname (authority) of the Atomist webhook URL.
 */
export function webhookBaseUrl(): string {
    return process.env.ATOMIST_WEBHOOK_BASEURL || "https://webhook.atomist.com";
}
