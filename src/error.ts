/*
 * Copyright © 2018 Atomist, Inc.
 *
 * See the LICENSE file in the root of this repository for licensing
 * information.
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
            message: (cur.message) ? `${acc.message}; ${cur.message}` : acc.message,
        };
    }, Success);
}
