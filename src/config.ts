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
import { runningAutomationClient } from "@atomist/automation-client/automationClient";
import * as _ from "lodash";

/**
 * See if custom configuration key exists, return its value if it
 * does, otherwise return the defaultValue.
 *
 * @param keyPath JSON path to key under the custom key
 * @param defaultValue value to return if key path does not exist
 * @return found value or default
 */
export function getCustomConfig<T = any>(cfg: Configuration, keyPath: string, defaultValue?: T): T {
    return _.get(cfg, `custom.${keyPath}`, defaultValue);
}

const automationConfiguration: Configuration = (runningAutomationClient && runningAutomationClient.configuration) ?
    runningAutomationClient.configuration : {};

/**
 * Default value for hostUlr if the custom.hostUrl configuration is
 * undefined.
 */
const defaultHostUrl: string = "http://localhost";

/**
 * Configuration value of custom.hostUrl.  This will be prepended to
 * the ingress path to create the base service endpoint URL.
 */
export const hostUrl = getCustomConfig(automationConfiguration, "hostUrl", defaultHostUrl);
