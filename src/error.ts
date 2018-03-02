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

import { HandlerResult, Success } from "@atomist/automation-client";

/**
 * Prepend message to (e: Error).message.
 *
 * @param e original Error
 * @param prefix text to prepend to e.message
 * @return e with modified message
 */
export function preErrMsg(e: Error, prefix: string): Error {
    e.message = `${prefix}: ${e.message}`;
    return e;
}

/**
 * Combine HandlerResults into a single HandlerResult.  Each
 * HandlerResult.code is summed into the final, single value and
 * messages are concatenated, separate by a semicolon (;).
 *
 * @param results array of HandlerResults
 * @return single, combined result
 */
export function reduceResults(results: HandlerResult[]): HandlerResult {
    return results.reduce((acc, cur) => {
        return {
            code: acc.code + cur.code,
            message: (cur.message) ? ((acc.message) ? `${acc.message}; ${cur.message}` : cur.message) : acc.message,
        };
    }, Success);
}
