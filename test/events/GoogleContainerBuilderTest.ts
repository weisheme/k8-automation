/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
 */

import "mocha";
import * as assert from "power-assert";

import { EventFired, HandlerContext } from "@atomist/automation-client/Handlers";

import { GoogleContainerBuilder } from "../../src/events/GoogleContainerBuilder";
import { GoogleContainerBuilderSub } from "../../src/typings/types";

describe("GoogleContainerBuilder", () => {

    describe("handle", () => {

        it("should successfully not build an event without the necessary information", done => {
            const gcb = new GoogleContainerBuilder();
            const e: EventFired<GoogleContainerBuilderSub.Subscription> = {
                data: {
                    Push: [
                        {
                            after: {
                                sha: "b4e9412dcbaea4ffb5310c34b77637c5f3418b10",
                            },
                            branch: "other/branch",
                            repo: {
                                defaultBranch: "master",
                                name: "gcb1",
                                org: {
                                    owner: "atomist-playground",
                                    provider: {
                                        providerId: "zjlmxjzwhurspem",
                                    },
                                    team: {
                                        id: "T7GMF5USG",
                                    },
                                },
                            },
                        },
                    ],
                },
                extensions: {
                    operationName: "GoogleContainerBuilderSub",
                },
            };
            const ctx = {} as HandlerContext;
            gcb.handle(e, ctx)
                .then(result => {
                    assert(result.code === 0);
                }).then(() => done(), done);
        });

    });

});
