/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
 */

import { Configuration } from "@atomist/automation-client";
import * as appRoot from "app-root-path";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);

const token = process.env.GITHUB_TOKEN;
const team = process.env.ATOMIST_TEAM;
const teamIds = (team) ? [team] : [];

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    keywords: ["atomist", "seed"],
    teamIds,
    token,
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
};
