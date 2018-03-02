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

import "mocha";
import * as assert from "power-assert";

import {
    deploymentTemplate,
    Ingress,
    ingressPatch,
    ingressRemove,
    ingressTemplate,
    serviceTemplate,
} from "../src/k8";

describe("k8", () => {

    describe("deploymentTemplate", () => {

        it("should create a deployment spec", () => {
            const req = {
                owner: "atomist-playground",
                repo: "losgatos1",
                teamId: "T7GMF5USG",
                // tslint:disable-next-line:max-line-length
                image: "gcr.io/reference-implementation-1/atomist-playground/losgatos1:b213603ea477ec4680508608ef9b58ff7b57637d",
                env: "testing",
            };
            const name = "ratomist-playground-0-losgatos19";
            const d = deploymentTemplate(req);
            assert(d.kind === "Deployment");
            assert(d.metadata.name === name);
            assert(d.metadata.labels.app === req.repo);
            assert(d.metadata.labels.owner === req.owner);
            assert(d.metadata.labels.teamId === req.teamId);
            assert(d.spec.replicas === 1);
            assert(d.spec.revisionHistoryLimit === 3);
            assert(d.spec.selector.matchLabels.app === req.repo);
            assert(d.spec.selector.matchLabels.owner === req.owner);
            assert(d.spec.selector.matchLabels.teamId === req.teamId);
            assert(d.spec.template.metadata.annotations["atomist.com/k8vent"] ===
                // tslint:disable-next-line:max-line-length
                "{\"environment\":\"testing\",\"webhooks\":[\"https://webhook.atomist.com/atomist/kube/teams/T7GMF5USG\"]}");
            assert(d.spec.template.metadata.annotations["atomist.com/repo-image"] ===
                // tslint:disable-next-line:max-line-length
                "[{\"container\":\"ratomist-playground-0-losgatos19\",\"repo\":{\"owner\":\"atomist-playground\",\"name\":\"losgatos1\"},\"image\":\"gcr.io/reference-implementation-1/atomist-playground/losgatos1\"}]");
            assert(d.spec.template.metadata.labels.app === req.repo);
            assert(d.spec.template.metadata.labels.owner === req.owner);
            assert(d.spec.template.metadata.labels.teamId === req.teamId);
            assert(d.spec.template.metadata.name === name);
            assert(d.spec.template.spec.containers.length === 1);
            assert(d.spec.template.spec.containers[0].name === name);
            assert(d.spec.template.spec.containers[0].image === req.image);
            assert(d.spec.template.spec.containers[0].env.length === 1);
            assert(d.spec.template.spec.containers[0].env[0].name === "ATOMIST_ENVIRONMENT");
            assert(d.spec.template.spec.containers[0].env[0].value === "testing");
            assert(d.spec.template.spec.containers[0].ports.length === 1);
            assert(d.spec.template.spec.containers[0].ports[0].name === "http");
            assert(d.spec.template.spec.containers[0].ports[0].containerPort === 8080);
            assert(d.spec.template.spec.containers[0].ports[0].protocol === "TCP");
            assert(d.spec.template.spec.dnsPolicy === "ClusterFirst");
            assert(d.spec.template.spec.restartPolicy === "Always");
        });

    });

    describe("serviceTemplate", () => {

        it("should create a service spec", () => {
            const req = {
                owner: "atomist-playground",
                repo: "losgatos1",
                teamId: "T7GMF5USG",
            };
            const s = serviceTemplate(req);
            const e = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    labels: {
                        creator: "atomist.k8-automation",
                        owner: "atomist-playground",
                        service: "losgatos1",
                        teamId: "T7GMF5USG",
                    },
                    name: "ratomist-playground-0-losgatos19",
                },
                spec: {
                    ports: [
                        {
                            name: "http",
                            port: 8080,
                            protocol: "TCP",
                            targetPort: "http",
                        },
                    ],
                    selector: {
                        app: "losgatos1",
                        owner: "atomist-playground",
                        teamId: "T7GMF5USG",
                    },
                    sessionAffinity: "None",
                    type: "NodePort",
                },
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("ingressTemplate", () => {

        it("should create an ingress spec", () => {
            const req = {
                owner: "atomist-playground",
                repo: "losgatos1",
                teamId: "T7GMF5USG",
                env: "testing",
            };
            const i = ingressTemplate(req);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        creator: "atomist.k8-automation",
                        env: "testing",
                        ingress: "nginx",
                        teamId: "T7GMF5USG",
                    },
                    name: "atm-gke-ri",
                },
                spec: {
                    rules: [
                        {
                            host: "sdm.atomist.io",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-losgatos19",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/losgatos1",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(i, e);
        });

    });

    describe("ingressPatch", () => {

        it("should create an ingress patch", () => {
            const req = {
                owner: "atomist-playground",
                repo: "losgatos1",
                teamId: "T7GMF5USG",
                env: "testing",
            };
            const i = ingressTemplate(req);
            const pReq = {
                owner: "atomist-playground",
                repo: "thunder-cats",
                teamId: "T7GMF5USG",
                env: "testing",
            };
            const ip = ingressPatch(i, pReq);
            const e = {
                spec: {
                    rules: [
                        {
                            host: "sdm.atomist.io",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-losgatos19",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/losgatos1",
                                    },
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-thunder-cats9",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/thunder-cats",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

    });

    describe("ingressRemove", () => {

        it("should create an ingress patch", () => {
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        creator: "atomist.k8-automation",
                        env: "testing",
                        ingress: "nginx",
                        teamId: "T7GMF5USG",
                    },
                    name: "atm-gke-ri",
                },
                spec: {
                    rules: [
                        {
                            host: "sdm.atomist.io",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-losgatos19",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/losgatos1",
                                    },
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-thunder-cats9",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/thunder-cats",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const req = {
                owner: "atomist-playground",
                repo: "losgatos1",
                teamId: "T7GMF5USG",
                env: "testing",
            };
            const ip = ingressRemove(i, req);
            const e = {
                spec: {
                    rules: [
                        {
                            host: "sdm.atomist.io",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-thunder-cats9",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/thunder-cats",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should not do anything if there is no match", () => {
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        creator: "atomist.k8-automation",
                        env: "testing",
                        ingress: "nginx",
                        teamId: "T7GMF5USG",
                    },
                    name: "atm-gke-ri",
                },
                spec: {
                    rules: [
                        {
                            host: "sdm.atomist.io",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-losgatos19",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/losgatos1",
                                    },
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-thunder-cats9",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/thunder-cats",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const req = {
                owner: "atomist-playground",
                repo: "le-tigre",
                teamId: "T7GMF5USG",
                env: "testing",
            };
            const ip = ingressRemove(i, req);
            assert.deepStrictEqual(ip, { spec: i.spec });
        });

        it("should remove the only path", () => {
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        creator: "atomist.k8-automation",
                        env: "testing",
                        ingress: "nginx",
                        teamId: "T7GMF5USG",
                    },
                    name: "atm-gke-ri",
                },
                spec: {
                    rules: [
                        {
                            host: "sdm.atomist.io",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "ratomist-playground-0-losgatos19",
                                            servicePort: 8080,
                                        },
                                        path: "/T7GMF5USG/testing/atomist-playground/losgatos1",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const req = {
                owner: "atomist-playground",
                repo: "losgatos1",
                teamId: "T7GMF5USG",
                env: "testing",
            };
            const ip = ingressRemove(i, req);
            const e: Partial<Ingress> = { spec: { rules: [{ host: "sdm.atomist.io", http: { paths: [] } }] } };
            assert.deepStrictEqual(ip, e);
        });

    });

});
