import { logger } from "@atomist/automation-client/internal/util/logger";
import { guid } from "@atomist/automation-client/internal/util/string";
import axios from "axios";
import * as _ from "lodash";
import promiseRetry = require("promise-retry");

export const secrets: { [key: string]: any } = {
    github: null,
    intercom: null,
    dashboard: null,
    logzio: null,
    mixpanel: null,
    oauth: null,
    teams: null,
    applicationId: guid(),
    environmentId: "local",
};

/**
 * Obtain a secret value from the environment
 * @param {string} path
 * @param {string} defaultValue
 * @returns {string}
 */
export function secret(path: string, defaultValue?: string): string {
    return _.get(secrets, path, defaultValue);
}

export const loadSecretsFromConfigServer = () => {
    const retryOptions = {
        retries: 5,
        factor: 3,
        minTimeout: 1 * 500,
        maxTimeout: 5 * 1000,
        randomize: true,
    };

    const configUrl = process.env.CONFIG_URL;
    if (configUrl) {
        logger.debug("Fetching secrets from config server at '%s'", configUrl);
        return promiseRetry(retryOptions, (retry, retryCount) => {

            if (retryCount > 1) {
                logger.debug("Re-fetching secrets from config server at '%s'", configUrl);
            }

            return axios.get(configUrl)
                .then(result => {
                    const data = result.data["secret/automation"];
                    secrets.github = data.github;
                    secrets.dashboard = data.dashboard;
                    secrets.logzio = data.logzio;
                    secrets.mixpanel = data.mixpanel;
                    secrets.oauth = data.oauth;
                    secrets.teams = data.teams;
                    secrets.intercom = data.intercom;
                    secrets.applicationId = `k8.${process.env.HOSTNAME}`;
                    secrets.environmentId = `k8.${data.environmentId}`;
                    process.env.DOMAIN = `k8.${data.environmentId}`;
                    return Promise.resolve();
                })
                .catch(err => {
                    logger.error("Error occurred fetching secrets from config server: %s", err.message);
                    retry(err);
                });
        });
    } else {
        return Promise.resolve();
    }
};
