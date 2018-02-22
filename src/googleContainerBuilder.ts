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

import { logger } from "@atomist/automation-client";
import * as Storage from "@google-cloud/storage";
import * as appRoot from "app-root-path";
import * as fs from "fs-extra";
import { JWT } from "google-auth-library";
import { google } from "googleapis";
import * as stringify from "json-stringify-safe";
import * as path from "path";
import promiseRetry = require("promise-retry");
import * as tar from "tar";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";

import { AtomistBuildStatus } from "./atomistWebhook";
import { preErrMsg } from "./error";

type BuildStatus = "STATUS_UNKNOWN" | "QUEUED" | "WORKING" | "SUCCESS" | "FAILURE" |
    "INTERNAL_ERROR" | "TIMEOUT" | "CANCELLED";

interface StorageSource {
    bucket: string;
    object: string;
    generation?: string;
}

interface BuildStorageSource {
    storageSource: StorageSource;
}

interface RepoSource {
    projectId: string;
    repoName: string;
    dir: string;
    branchName?: string;
    tagName?: string;
    commitSha?: string;
}

interface BuildRepoSource {
    repoSource: RepoSource;
}

type BuildSouce = BuildStorageSource | BuildRepoSource;

type HashType = "NONE" | "SHA256";

interface Hash {
    type: HashType;
    value: string;
}

interface FileHashes {
    fileHash: Hash[];
}

interface TimeSpan {
    startTime: string;
    endTime: string;
}

interface Volume {
    name: string;
    path: string;
}

interface BuildStep {
    name: string;
    env?: string[];
    args?: string[];
    dir?: string;
    id?: string;
    waitFor?: string[];
    entrypoint?: string;
    secretEnv?: string[];
    volumes?: Volume[];
    timing?: TimeSpan;
}

interface BuiltImage {
    name: string;
    digest: string;
    pushTiming: TimeSpan;
}

interface BuildResults {
    images: BuiltImage[];
    buildStepImages: string[];
}

interface Secret {
    kmsKeyName: string;
    secretEnv: {
        [key: string]: string;
    };
}

interface BuildResource {
    id?: string;
    projectId?: string;
    status?: BuildStatus;
    statusDetail?: string;
    source: BuildStorageSource | BuildRepoSource;
    steps?: BuildStep[];
    results?: BuildResults;
    createTime?: string;
    startTime?: string;
    finishTime?: string;
    timeout?: string;
    images?: string[];
    logsBucket?: string;
    sourceProvenance?: {
        resolvedStorageSource?: StorageSource;
        resolvedRepoSource?: RepoSource;
        fileHashes: {
            [key: string]: FileHashes;
        };
    };
    buildTriggerId?: string;
    options?: {
        sourceProvenanceHash?: HashType[];
        requestedVerifyOption?: "NOT_VERIFIED" | "VERIFIED";
        machineType?: "UNSPECIFIED" | "N1_HIGHCPU_8" | "N1_HIGHCPU_32";
        diskSizeGb?: string;
        substitutionOption?: "MUST_MATCH" | "ALLOW_LOOSE";
        logStreamingOption?: "STREAM_DEFAULT" | "STREAM_ON" | "STREAM_OFF";
    };
    logUrl?: string;
    substitutions?: {
        [key: string]: string;
    };
    tags?: string[];
    secrets?: Secret[];
    timing?: {
        BUILD: TimeSpan;
        PUSH: TimeSpan;
        FETCHSOURCE: TimeSpan;
    };
}

interface BuildPayload {
    projectId: string;
    resource: BuildResource;
    auth?: JWT;
}

function nodeFilter(p: string, stat: tar.FileStat): boolean {
    return !(/\.tgz$/.test(p) || p.includes("node_modules"));
}

const projectId = "reference-implementation-1";

/**
 * Return the full Docker image tag for the given arguments.
 *
 * @param owner repository owner, i.e., user or organization
 * @param repo repository name
 * @param sha commit SHA
 * @return Docker image tag in form of REGISTRY/PROJECT/OWNER/NAME:VERSION
 */
export function imageTag(owner: string, repo: string, sha: string): string {
    return `gcr.io/${projectId}/${owner}/${repo}:${sha}`;
}

/**
 * Tar, gzip, and upload current directory, start Google Container
 * Builder and poll until completion, returning the build status.
 *
 * @param dir path to repository on local file system
 * @param owner repository owner, i.e., user or organization
 * @param repo repository name
 * @param sha commit SHA
 * @param jwtClient Google Cloud JWT client
 * @return build status
 */
export function googleContainerBuild(
    dir: string,
    owner: string,
    repo: string,
    sha: string,
    jwtClient: JWT,
): Promise<AtomistBuildStatus> {

    const repoSlug = `${owner}/${repo}`;
    logger.debug("starting build of %s", repoSlug);
    const bucket = "reference-implementation-1-repos-1";
    const srcTar = `${owner}-${repo}-${uuidv4()}.tgz`;
    const srcTarPath = path.join(dir, srcTar);
    const cloudbuild = google.cloudbuild("v1");
    const image = imageTag(owner, repo, sha);
    const buildPayload: BuildPayload = {
        projectId,
        resource: {
            source: {
                storageSource: { bucket, object: srcTar },
            },
            steps: [{
                name: "gcr.io/cloud-builders/docker",
                args: ["build", "-t", image, "."],
            }],
            images: [image],
            tags: ["customer", "reference-implementation"],
        },
        auth: jwtClient,
    };
    let storage: Storage.Storage;
    const cleanup: Array<() => Promise<void>> = [];

    return tar.create({ cwd: dir, file: srcTarPath, filter: nodeFilter, gzip: true }, ["."])
        .catch(e => Promise.reject(preErrMsg(e, `failed to create ${srcTar}`)))
        .then(() => {
            logger.debug("created tarball %s", srcTar);
            cleanup.push(() => fs.unlink(srcTarPath));
            const storageCredentials: Storage.Credentials = {
                client_email: jwtClient.email,
                private_key: jwtClient.key,
            };
            const storageConfig: Storage.ConfigurationObject = { credentials: storageCredentials };
            try {
                storage = Storage(storageConfig);
            } catch (e) {
                return Promise.reject(preErrMsg(e, `failed to create storage client`));
            }
            return storage.bucket(bucket).upload(srcTarPath, { destination: srcTar })
                .catch(e => Promise.reject(preErrMsg(e, `failed to upload ${srcTarPath} to ${bucket}`)));
        })
        .then(() => {
            logger.debug("uploaded %s to %s", srcTarPath, bucket);
            cleanup.push(() => storage.bucket(bucket).file(srcTar).delete().then(() => { return; }));
            let pCreateBuild: any;
            try {
                pCreateBuild = util.promisify(cloudbuild.projects.builds.create);
            } catch (e) {
                return Promise.reject(preErrMsg(e, `failed to promisify builds.create`));
            }
            logger.debug("calling builds.create for %s", repoSlug);
            return pCreateBuild(buildPayload, {})
                .catch((e: Error) => Promise.reject(preErrMsg(e, `failed to start build`)));
        })
        .then((createResponse: any) => {
            if (!createResponse.data) {
                const msg = `no response data from create build: ${stringify(createResponse)}`;
                return Promise.reject(new Error(msg));
            }
            if (!createResponse.data.metadata || !createResponse.data.metadata.build) {
                const msg = `unexpected response from create build: ${stringify(createResponse.data)}`;
                return Promise.reject(new Error(msg));
            }
            const buildResponse: BuildResource = createResponse.data.metadata.build;
            const buildId = buildResponse.id;
            if (!buildId) {
                const msg = `create build response missing build ID: ${stringify(buildResponse)}`;
                return Promise.reject(new Error(msg));
            }
            let pGetBuild: any;
            try {
                pGetBuild = util.promisify(cloudbuild.projects.builds.get);
            } catch (e) {
                return Promise.reject(preErrMsg(e, `failed to promisify builds.get`));
            }
            const getPayload = {
                projectId,
                id: buildId,
                auth: jwtClient,
            };
            const retryOptions = {
                retries: 12 * 60 / 5, // default build timeout is 600 s
                factor: 1,
                minTimeout: 5 * 1000,
                maxTimeout: 5 * 1000,
            };
            logger.debug("starting to poll %s build %s", repoSlug, buildId);
            return promiseRetry(retryOptions, (retry, retryCount) => {
                if (retryCount % 12 === 0) {
                    logger.debug("polling %s build %s count %d", repoSlug, buildId, retryCount);
                }
                return pGetBuild(getPayload, {})
                    .then((getResponse: any) => {
                        if (!getResponse.data) {
                            const msg = `no response data from get build: ${stringify(getResponse)}`;
                            return Promise.reject(new Error(msg));
                        }
                        const br: BuildResource = getResponse.data;
                        const status = br.status;
                        if (!status) {
                            return Promise.reject(new Error(`build has no status: ${stringify(br)}`));
                        }
                        if (status === "STATUS_UNKNOWN" || status === "QUEUED" || status === "WORKING") {
                            return Promise.reject(new Error(`build ${br.id} not done: ${status}`));
                        }
                        logger.debug("%s build GCB status: %s", repoSlug, status);
                        return status;
                    })
                    .catch(retry);
            })
                .catch((e: Error) => Promise.reject(preErrMsg(e, `failed to get final build status`)));
        })
        .then((status: BuildStatus) => {
            let atomistStatus: AtomistBuildStatus;
            switch (status) {
                case "STATUS_UNKNOWN":
                    return Promise.reject(new Error(`build status unknown`));
                case "QUEUED":
                case "WORKING":
                case "TIMEOUT":
                    return Promise.reject(new Error(`build did not complete in allotted time`));
                case "SUCCESS":
                    atomistStatus = "passed";
                    break;
                case "FAILURE":
                    atomistStatus = "failed";
                    break;
                case "INTERNAL_ERROR":
                    atomistStatus = "error";
                    break;
                case "CANCELLED":
                    atomistStatus = "canceled";
                    break;
                default:
                    return Promise.reject(`unexpected Google Container Builder build status: ${status}`);
            }
            return Promise.all(cleanup.map(c => c()))
                .then(() => atomistStatus, e => {
                    logger.warn("failed to clean up %s build: %s", repoSlug, e.message);
                    return atomistStatus;
                });
        })
        .catch(err => {
            return Promise.all(cleanup.map(c => c()))
                .then(() => Promise.reject(err), e => {
                    err.message = `${err.message}; failed to clean up ${repoSlug} build: ${e.message}`;
                    return Promise.reject(err);
                });
        });
}
