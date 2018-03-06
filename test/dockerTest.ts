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

import { dockerNameComponent, dockerTag } from "../src/docker";

describe("docker", () => {

    describe("dockerNameComponent", () => {

        it("should do nothing to a valid name component", () => {
            const ncs = [
                "simple",
                "4num83r5",
                "with-dash",
                "with_underscore",
                "with.period",
                "some-valid_name.comp0nent",
                "it__can__have__two__consecutive__underscores",
                "or-----any-----number-----------of--------------dashes",
            ];
            ncs.forEach(n => {
                const v = dockerNameComponent(n);
                assert(v === n);
            });
        });

        it("should lower case capital letters", () => {
            const nc = "UpperCase";
            const v = dockerNameComponent(nc);
            const e = "uppercase";
            assert(v === e);
        });

        it("should replace invalid characters ", () => {
            const ncs = [
                { i: "this&that", o: "this_that" },
                { i: "this%%that", o: "this__that" },
                { i: ".leading.period", o: "xleading.period" },
                { i: "trailing.period.", o: "trailing.periodx" },
                { i: "-opening-dash", o: "xopening-dash" },
                { i: "trailing-dash-", o: "trailing-dashx" },
                { i: "two..periods...not.allowed", o: "two.periods.not.allowed" },
                { i: "no___three____underscores", o: "no__three__underscores" },
                { i: "this!@#$%^&*that", o: "this__that" },
            ];
            ncs.forEach(nc => {
                const v = dockerNameComponent(nc.i);
                assert(v === nc.o);
            });
        });

    });

    describe("dockerTag", () => {

        it("should do nothing to a valid tag", () => {
            const tags = [
                "simple",
                "UPPERCASE",
                "4num83r5",
                "with-dash",
                "with_underscore",
                "with.period",
                "some-valid_dock3r.tag",
                "a-very-l0ng-but-compl3t3ly-val1d-docker-tag._And-then-some-more-stuff-but-still-valid",
                "_can-start-with-underscore",
                "can-end-with-dash-",
                "can.end.with.period.",
                "consecutive--dashes---are----ok",
                "same...with....periods",
                "do__not___forget____underscores",
            ];
            tags.forEach(t => {
                const v = dockerTag(t);
                assert(v === t);
            });
        });

        it("should truncate too long tags", () => {
            /* tslint:disable:max-line-length */
            const t = "1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890";
            const v = dockerTag(t);
            const e = "12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678";
            assert(v === e);
            /* tslint:enable:max-line-length */
        });

        it("should replace invalid characters", () => {
            const tags = [
                { i: "this&that", o: "this_that" },
                { i: "this%%that", o: "this__that" },
                { i: ".leading.period.", o: "_leading.period." },
                { i: "-opening-dash-", o: "_opening-dash-" },
                { i: "-opening-dash&other$tuff", o: "_opening-dash_other_tuff" },
            ];
            tags.forEach(t => {
                const v = dockerTag(t.i);
                assert(v === t.o);
            });
        });

    });

});
