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

import { Configuration } from "@atomist/automation-client";

import { getCustomConfig } from "../src/config";

describe("config", () => {

    describe("getCustomConfig", () => {

        it("should return the default", () => {
            const cfg: Configuration = {
                custom: {
                    raspberry: "beret",
                },
            };
            const d: string = "corvette";
            const v = getCustomConfig(cfg, "red", d);
            assert(v === "corvette");
        });

        it("should return the config value", () => {
            const cfg: Configuration = {
                custom: {
                    raspberry: "beret",
                },
            };
            const d: string = "sorbet";
            const v = getCustomConfig(cfg, "raspberry", d);
            assert(v === "beret");
        });

        it("should return a number", () => {
            const cfg: Configuration = {
                custom: {
                    prince: 1999,
                },
            };
            const d: number = 7;
            const v = getCustomConfig(cfg, "prince", d);
            assert(v === 1999);
        });

        it("should return nested config value", () => {
            const cfg: Configuration = {
                custom: {
                    i: {
                        could: {
                            never: {
                                take: {
                                    the: {
                                        place: {
                                            of: {
                                                your: "man",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const d: string = "dog";
            const v = getCustomConfig(cfg, "i.could.never.take.the.place.of.your", d);
            assert(v === "man");
        });

    });

});
