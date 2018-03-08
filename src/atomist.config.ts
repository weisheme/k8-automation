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

import { Configuration } from "@atomist/automation-client";
import { AutomationEventListener } from "@atomist/automation-client/server/AutomationEventListener";
import * as appRoot from "app-root-path";
import * as config from "config";

import {
    resolveApplication,
    resolveEnvironment,
    resolveTeamIds,
    resolveToken,
} from "./util/configuration";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot.path}/package.json`);

const notLocal = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";

export interface ConfigurationPlus {
    application?: string;
    environment?: string;
    groups?: string[];
}

export const configuration: Configuration & ConfigurationPlus = {
    name: pj.name,
    version: pj.version,
    keywords: pj.keywords,
    environment: resolveEnvironment(),
    application: resolveApplication(),
    policy: config.get("policy"),
    teamIds: resolveTeamIds(),
    groups: config.get("groups"),
    token: resolveToken(),
    endpoints: {
        api: config.get("endpoints.api"),
        graphql: config.get("endpoints.graphql"),
    },
    listeners: [],
    http: {
        enabled: true,
    },
    applicationEvents: {
        enabled: true,
        teamId: process.env.ATOMIST_TEAM,
    },
    cluster: {
        enabled: notLocal,
    },
    ws: {
        enabled: true,
        termination: {
            graceful: true,
        },
    },
};
