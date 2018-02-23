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

declare module "child-process-promise" {
    export interface ExecOptions {
        cwd?: string;
        env?: any;
        shell?: string;
        timeout?: number;
        maxBuffer?: number;
        killSignal?: string;
        uid?: number;
        gid?: number;
    }
    export interface ExecResult {
        stdout: string;
        stderr: string;
    }
    export function exec(cmd: string, options: ExecOptions): Promise<ExecResult>;
}

declare module "tmp-promise" {
    export interface TmpDir {
        path: string;
        cleanup(): void;
    }
    export function dir(options?: any): Promise<TmpDir>;
}

declare module "logzio-nodejs";
declare module "serialize-error";
