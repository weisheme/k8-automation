/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
 */

import "mocha";
import * as assert from "power-assert";

import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import * as fs from "fs-extra";

import { EventFired, HandlerContext, logger } from "@atomist/automation-client";
import { LoggingConfig } from "@atomist/automation-client/internal/util/logger";

import {
    AtomistBuildStatus,
    AtomistLinkImage,
    AtomistWebhookType,
    postBuildWebhook,
    postLinkImageWebhook,
    postWebhook,
} from "../src/atomistWebhook";

LoggingConfig.format = "cli";
(logger as any).level = process.env.LOG_LEVEL || "info";

describe("atomistWebhook", () => {

    const noRetryOptions = {
        retries: 1,
        factor: 2,
        minTimeout: 1,
        maxTimeout: 1,
        randomize: false,
    };

    describe("postWebhook", () => {

        const payload = {
            iron_and_wine: "Resurrection Fern",
            elliott_smith: "Bottle Up and Explode!",
            ti: "Live Your Life",
            my_morning_jacket: "One Big Holiday",
            the_replacements: "Alex Chilton",
        };
        const webhook: AtomistWebhookType = "build";
        const teamId = "T31110TT";
        const urlTail = `atomist/${webhook}/teams/${teamId}`;
        const url = `https://webhook.atomist.com/${urlTail}`;

        it("should successfully post", done => {
            let posted = false;
            const mock = new MockAdapter(axios);
            mock.onPost(url, payload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postWebhook(webhook, payload, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted, "webhook not posted");
                })
                .then(() => done(), done);
        });

        it("should retry", done => {
            let posted = false;
            const mock = new MockAdapter(axios);
            mock
                .onPost(url, payload).replyOnce(500)
                .onPost(url, payload).replyOnce(config => {
                    posted = true;
                    return [200];
                });
            postWebhook(webhook, payload, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted, "webhook not posted");
                })
                .then(() => done(), done);
        });

        it("should respect the ATOMIST_WEBHOOK_BASEURL environment variable", done => {
            let posted = false;
            process.env.ATOMIST_WEBHOOK_BASEURL = "https://united-artists.com:1978";
            const envUrl = `${process.env.ATOMIST_WEBHOOK_BASEURL}/${urlTail}`;
            const mock = new MockAdapter(axios);
            mock.onPost(envUrl, payload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postWebhook(webhook, payload, teamId, noRetryOptions)
                .then(res => {
                    delete process.env.ATOMIST_WEBHOOK_BASEURL;
                    assert(res);
                    assert(posted, "webhook not posted");
                }, err => {
                    delete process.env.ATOMIST_WEBHOOK_BASEURL;
                    assert.fail("posting to webhook somehow failed");
                })
                .then(() => done(), done);
        });

        it("should fail when looking for different payload", done => {
            let posted = false;
            const mock = new MockAdapter(axios);
            mock.onPost(url, {}).replyOnce(config => {
                posted = true;
                return [200];
            });
            postWebhook(webhook, payload, teamId, noRetryOptions)
                .then(res => {
                    assert(res === false);
                    assert(posted === false, "webhook erroneously posted successfully");
                })
                .then(() => done(), done);
        });

    });

    describe("postBuildWebhook", () => {

        const repo = "baker-street";
        const owner = "gerry-rafferty";
        const branch = "StealersWheel";
        const sha = "abcdef0123456789876543210fedcba";
        const teamId = "TC1TY2C1TY";
        const urlBase = "https://webhook.atomist.com";
        const urlTail = `atomist/build/teams/${teamId}`;
        const url = `${urlBase}/${urlTail}`;
        const payload = {
            repository: {
                owner_name: owner,
                name: repo,
            },
            type: "push",
            commit: sha,
            branch,
            provider: "GoogleContainerBuilder",
        };

        it("should successfully post build start", done => {
            let posted = false;
            const status: AtomistBuildStatus = "started";
            const whPayload = { ...payload, status };
            const mock = new MockAdapter(axios);
            mock.onPost(url, whPayload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postBuildWebhook(owner, repo, branch, sha, status, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted);
                })
                .then(() => done(), done);
        });

        it("should successfully post build passed", done => {
            let posted = false;
            const status: AtomistBuildStatus = "passed";
            const whPayload = { ...payload, status };
            const mock = new MockAdapter(axios);
            mock.onPost(url, whPayload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postBuildWebhook(owner, repo, branch, sha, status, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted);
                })
                .then(() => done(), done);
        });

        it("should successfully post build failed", done => {
            let posted = false;
            const status: AtomistBuildStatus = "failed";
            const whPayload = { ...payload, status };
            const mock = new MockAdapter(axios);
            mock.onPost(url, whPayload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postBuildWebhook(owner, repo, branch, sha, status, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted);
                })
                .then(() => done(), done);
        });

        it("should retry post build canceled", done => {
            let posted = false;
            const status: AtomistBuildStatus = "canceled";
            const whPayload = { ...payload, status };
            const mock = new MockAdapter(axios);
            mock
                .onPost(url, whPayload).replyOnce(500)
                .onPost(url, whPayload).replyOnce(config => {
                    posted = true;
                    return [200];
                });
            postBuildWebhook(owner, repo, branch, sha, status, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted);
                })
                .then(() => done(), done);
        });

        it("should respect the ATOMIST_WEBHOOK_BASEURL environment variable", done => {
            let posted = false;
            const status: AtomistBuildStatus = "passed";
            const whPayload = { ...payload, status };
            process.env.ATOMIST_WEBHOOK_BASEURL = "https://united-artists.com:1978";
            const envUrl = `${process.env.ATOMIST_WEBHOOK_BASEURL}/${urlTail}`;
            const mock = new MockAdapter(axios);
            mock.onPost(envUrl, whPayload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postBuildWebhook(owner, repo, branch, sha, status, teamId, noRetryOptions)
                .then(res => {
                    delete process.env.ATOMIST_WEBHOOK_BASEURL;
                    assert(res);
                    assert(posted);
                }, err => {
                    delete process.env.ATOMIST_WEBHOOK_BASEURL;
                    assert.fail("posting to webhook somehow failed");
                })
                .then(() => done(), done);
        });

    });

    describe("postLinkImageWebhook", () => {

        const repo = "ziggy-stardust";
        const owner = "david-bowie";
        const sha = "abcdef0123456789876543210fedcba";
        const image = "spiders/from/mars:1972.6.16";
        const teamId = "TH3R1S3ANDFA11";
        const url = `https://webhook.atomist.com/atomist/link-image/teams/${teamId}`;
        const payload: AtomistLinkImage = {
            git: {
                owner,
                repo,
                sha,
            },
            docker: {
                image,
            },
            type: "link-image",
        };

        it("should successfully post link-image webhook payload", done => {
            let posted = false;
            const mock = new MockAdapter(axios);
            mock.onPost(url, payload).replyOnce(config => {
                posted = true;
                return [200];
            });
            postLinkImageWebhook(owner, repo, sha, image, teamId, noRetryOptions)
                .then(res => {
                    assert(res);
                    assert(posted, "webhook did not get posted");
                })
                .then(() => done(), done);
        });

    });

});
