import { logger } from "@atomist/automation-client";
import * as Storage from "@google-cloud/storage";
import * as appRoot from "app-root-path";
import * as fs from "fs-extra";
import { JWT } from "google-auth-library";
import { google } from "googleapis";
import * as stringify from "json-stringify-safe";
import promiseRetry = require("promise-retry");
import * as tar from "tar";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";

import { AtomistBuildStatus } from "./atomistWebhook";

function nodeFilter(path: string, stat: tar.FileStat): boolean {
    return !(/\.tgz$/.test(path) || path.includes("node_modules"));
}

/**
 * Prepend message to (e: Error).message.
 *
 * @param e original Error
 * @param prefix text to prepend to e.message
 * @return e with modified message
 */
function prependMessage(e: Error, prefix: string): Error {
    e.message = `${prefix}: ${e.message}`;
    return e;
}

export type BuildStatus = "STATUS_UNKNOWN" | "QUEUED" | "WORKING" | "SUCCESS" | "FAILURE" |
    "INTERNAL_ERROR" | "TIMEOUT" | "CANCELLED";

export interface StorageSource {
    bucket: string;
    object: string;
    generation?: string;
}

export interface BuildStorageSource {
    storageSource: StorageSource;
}

export interface RepoSource {
    projectId: string;
    repoName: string;
    dir: string;
    branchName?: string;
    tagName?: string;
    commitSha?: string;
}

export interface BuildRepoSource {
    repoSource: RepoSource;
}

export type BuildSouce = BuildStorageSource | BuildRepoSource;

export type HashType = "NONE" | "SHA256";

export interface Hash {
    type: HashType;
    value: string;
}

export interface FileHashes {
    fileHash: Hash[];
}

export interface TimeSpan {
    startTime: string;
    endTime: string;
}

export interface Volume {
    name: string;
    path: string;
}

export interface BuildStep {
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

export interface BuiltImage {
    name: string;
    digest: string;
    pushTiming: TimeSpan;
}

export interface BuildResults {
    images: BuiltImage[];
    buildStepImages: string[];
}

export interface Secret {
    kmsKeyName: string;
    secretEnv: {
        [key: string]: string;
    };
}

export interface BuildResource {
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

export interface BuildPayload {
    projectId: string;
    resource: BuildResource;
    auth?: JWT;
}

/**
 * Tar, gzip, and upload current directory and start Google Container
 * Builder.
 *
 * @return build status
 */
export function gcBuilder(): Promise<AtomistBuildStatus> {
    logger.debug("starting");

    const projectId = "reference-implementation-1";
    const bucket = "reference-implementation-1-repos-1";
    const tarBall = `spring-${uuidv4()}.tgz`;
    let googleCloudKey: Storage.Credentials;
    const cloudbuild = google.cloudbuild("v1");
    logger.debug("cloudbuild: %s", stringify(cloudbuild));
    const image = `gcr.io/${projectId}/atomist/k8-automation:latest`;
    const buildPayload: BuildPayload = {
        projectId,
        resource: {
            source: {
                storageSource: { bucket, object: tarBall },
            },
            steps: [{
                name: "gcr.io/cloud-builders/docker",
                args: ["build", "-t", image, "."],
            }],
            images: [image],
            tags: ["customer", "reference-implementation"],
        },
    };
    let jwtClient: JWT;
    let storage: Storage.Storage;
    const cleanup: Array<() => Promise<void>> = [];

    return fs.realpath(`${appRoot}/../creds/ri-ci-1.json`)
        .catch(e => Promise.reject(prependMessage(e, `failed to determine real path of creds file`)))
        .then(keyFile => {
            try {
                // tslint:disable-next-line:no-var-requires
                googleCloudKey = require(keyFile);
            } catch (e) {
                e.message = `failed to require key file: ${e.message}`;
                return Promise.reject(e);
            }
            logger.debug("calling JWT");
            jwtClient = new google.auth.JWT(
                googleCloudKey.client_email,
                null,
                googleCloudKey.private_key,
                ["https://www.googleapis.com/auth/cloud-platform"],
                null,
            );
            logger.debug("jwtClient: %s", stringify(jwtClient));

            return jwtClient.authorize()
                .catch((e: Error) => Promise.reject(prependMessage(e, `failed to authorize JWT client`)));
        })
        .then(tokens => {
            logger.debug("authorized: tokens: %s", stringify(tokens));
            buildPayload.auth = jwtClient;
            return tar.create({ gzip: true, file: tarBall, filter: nodeFilter }, ["."])
                .catch(e => Promise.reject(prependMessage(e, `failed to create ${tarBall}`)));
        })
        .then(() => {
            logger.debug("created tarball %s", tarBall);
            cleanup.push(() => fs.unlink(tarBall));
            const storageConfig: Storage.ConfigurationObject = { credentials: googleCloudKey };
            try {
                storage = Storage(storageConfig);
            } catch (e) {
                return Promise.reject(prependMessage(e, `failed to create storage client`));
            }
            return storage.bucket(bucket).upload(tarBall)
                .catch(e => Promise.reject(prependMessage(e, `failed to upload ${tarBall} to ${bucket}`)));
        })
        .then(() => {
            logger.debug("uploaded %s to %s", tarBall, bucket);
            cleanup.push(() => storage.bucket(bucket).file(tarBall).delete().then(() => { return; }));
            let pCreateBuild: any;
            try {
                pCreateBuild = util.promisify(cloudbuild.projects.builds.create);
            } catch (e) {
                return Promise.reject(prependMessage(e, `failed to promisify builds.create`));
            }
            logger.debug("calling builds.create");
            return pCreateBuild(buildPayload, {})
                .catch((e: Error) => Promise.reject(prependMessage(e, `failed to start build`)));
        })
        .then((createResponse: any) => {
            const operation = createResponse.data;
            logger.info("operation: %s", stringify(operation));
            const buildResponse: BuildResource = operation.metadata.build;
            const buildId = buildResponse.id;
            let pGetBuild: any;
            try {
                pGetBuild = util.promisify(cloudbuild.projects.builds.get);
            } catch (e) {
                return Promise.reject(prependMessage(e, `failed to promisify builds.get`));
            }
            const retryOptions = {
                retries: 180, // default build timeout is 600, we poll for 900
                factor: 1,
                minTimeout: 5 * 1000,
                maxTimeout: 5 * 1000,
            };
            return promiseRetry(retryOptions, (retry, retryCount) => {
                return pGetBuild()
                    .then((getResponse: any) => {
                        const br: BuildResource = getResponse.data.metadata.build;
                        if (br.status === "STATUS_UNKNOWN" ||
                            br.status === "QUEUED" ||
                            br.status === "WORKING") {
                            throw new Error(`build ${br.id} not done: ${br.status}`);
                        }
                        return br.status;
                    })
                    .catch((err: Error) => retry(err));
            })
                .catch((e: Error) => Promise.reject(prependMessage(e, `failed to get final build status`)));
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
            }
            return Promise.all(cleanup.map(c => c()))
                .then(() => atomistStatus, e => {
                    logger.warn(`failed to clean up build: ${e.message}`);
                    return atomistStatus;
                });
        })
        .catch(err => {
            return Promise.all(cleanup.map(c => c()))
                .then(() => Promise.reject(err), e => {
                    err.message = `${err.message}; clean up failed: ${e.message}`;
                    return Promise.reject(err);
                });
        });
}

gcBuilder()
    .then(success => {
        if (!success) {
            logger.error("build failed: %s", stringify(success));
            process.exit(1);
        }
        logger.info("build succeeded");
        process.exit(0);
    }, err => {
        logger.error(`build errored: ${err.message}`);
        process.exit(2);
    });
