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

import * as appRoot from "app-root-path";
import * as config from "config";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot.path}/package.json`);

/**
 * Examine config and environment for Atomist team IDs.  The
 * ATOMIST_TEAMS environment variable takes precedence over the
 * ATOMIST_TEAM environment variable, which takes precedence over the
 * configuration "teamdIds".
 */
export function resolveTeamIds(): string[] {
    if (process.env.ATOMIST_TEAMS) {
        return process.env.ATOMIST_TEAMS.split(",");
    }
    if (process.env.ATOMIST_TEAM) {
        return [process.env.ATOMIST_TEAM];
    }
    return config.get("teamIds");
}

/**
 * Resolve a value from a environment variables or configuration keys.
 * The environment variables are checked in order and take precedence
 * over the configuration key, which are also checked in order.  If
 * no truthy values are found, undefined is returned.
 *
 * @param envs environment variables to check
 * @param cfgs configuration keys, as JSON paths, to check
 * @return first truthy value found, or undefined
 */
export function resolveEnvironmentConfig(envs: string[], cfgs: string[]): string {
    for (const ev of envs) {
        if (process.env[ev]) {
            return process.env[ev];
        }
    }
    for (const cv of cfgs) {
        if (config.has(cv)) {
            return config.get(cv);
        }
    }
    return undefined;
}

/**
 * Resolve the token from the environment and configuration.  The
 * GITHUB_TOKEN environment variable takes precedence over the
 * configuration.
 */
export const resolveToken = () => resolveEnvironmentConfig(["GITHUB_TOKEN"], ["token"]);

/**
 * Resolve the environment from the environment and configuration.
 * The ATOMIST_ENVIRONMENT environment variable takes precedence over
 * the configuration.  If neither are set, use NODE_ENV.  If that is
 * not set, undefined is returned.
 */
export function resolveEnvironment(): string {
    return resolveEnvironmentConfig(["ATOMIST_ENVIRONMENT"], ["environment"]) || process.env.NODE_ENV;
}

/**
 * Resolve the application ID from the environment and configuration.
 * The ATOMIST_APPLICATION environment variable takes precedence over
 * the configuration.
 */
export function resolveApplication(): string {
    return resolveEnvironmentConfig(["ATOMIST_APPLICATION"], ["application"]) || pj.name;
}
