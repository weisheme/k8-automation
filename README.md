# @atomist/k8-automation

[![npm version](https://badge.fury.io/js/%40atomist%2Fk8-automation.svg)](https://badge.fury.io/js/%40atomist%2Fk8-automation)
[![Docker Pulls](https://img.shields.io/docker/pulls/atomist/k8-automation.svg)](https://hub.docker.com/r/atomist/k8-automation/)

This repository contains automations for deploying applications to
Kubernetes using the [Atomist][atomist] API.  Currently, deploying
Docker images as deployments with optional services and ingress rules
is supported.

This project uses the [`@atomist/automation-client`][client] and
[`@atomist/sdm`][sdm] node modules to implement a local client that
connects to the Atomist API and executes goals on behalf of a software
delivery machine.

[client]: https://github.com/atomist/automation-client-ts (@atomist/automation-client Node Module)
[sdm]: https://github.com/atomist/github-sdm (@atomist/sdm Node Module)

## Prerequisites

Below are brief instructions on how to get started running this
project yourself.  If you just want to use the functionality this
project provides, see the [Atomist documentation][docs].

[docs]: https://docs.atomist.com/ (Atomist User Guide)

### Atomist workspace

You need an Atomist workspace.  If you do not already have an Atomist
workspace, you can sign up with Atomist at
[https://app.atomist.com/][atm-app].  See the [Atomist User
Guide][atm-user] for detailed instructions on how to sign up with
Atomist.

[atm-app]: https://app.atomist.com/ (Atomist Web Interface)
[atm-user]: https://docs.atomist.com/user/ (Atomist User Guide)

### Kubernetes

This automation works with [Kubernetes][kube], so you need a
Kubernetes cluster with a functioning ingress controller, such as
[ingress-nginx][].

If you do not have access to a Kubernetes cluster, you can create one
on your local system using [minikube][].  Once you have minikube
running, you can create an ingress controller in the cluster using the
ingress add-on.

```console
$ minikube start
$ minikube addons enable ingress
```

[kube]: https://kubernetes.io/ (Kubernetes)
[ingress-nginx]: https://github.com/kubernetes/ingress-nginx (Ingress nginx)
[minikube]: https://kubernetes.io/docs/getting-started-guides/minikube/ (Minikube)

## Configuration

You can run k8-automation in either "cluster-wide" mode or
"namespace-scoped" mode.  In cluster-wide mode, k8-automation is able
to deploy and update applications in any namespace but it requires a
user with cluster-admin role privileges to install it.  If you only
have access to admin role privileges in a namespace, you can install
k8-automation in namespace-scoped mode, where it will only be able to
deploy and update resources in that namespace.

## Running

See the [Atomist Kubernetes documentation][atomist-kube] for detailed
instructions on using Atomist with Kubernetes.  Briefly, if you
already have an [Atomist workspace][atomist-getting-started], you can
run the following commands to create the necessary resources in your
Kubernetes cluster.  Replace `WORKSPACE_ID` with your Atomist
workspace/team ID and `TOKEN` with a GitHub token with "read:org"
scopes for a user within the GitHub organization linked to your
Atomist workspace.

```
$ kubectl apply --filename=https://raw.githubusercontent.com/atomist/k8-automation/master/assets/kubectl/cluster-wide.yaml
$ kubectl create secret --namespace=k8-automation generic automation \
    --from-literal=config='{"teamIds":["WORKSPACE_ID"],"token":"TOKEN"}'
```

[atomist-kube]: https://docs.atomist.com/user/kubernetes/ (Atomist - Kubernetes)
[atomist-getting-started]: https://docs.atomist.com/user/ (Atomist - Getting Started)

## SDM interface

The KubeDeploy event handler triggers off an SDM Goal with the
following properties:

JSON Path | Value
----------|------
`fulfillment.name` | @atomist/k8-automation
`fulfillment.method` | side-effect
`state` | requested

In addition, it expects the SDM Goal to have a `data` property that
when parsed as JSON has a `kubernetes` property whose value is an
object with the following properties:

Property | Required | Description
---------|----------|------------
`name` | Yes | Name of the resources that will be created
`environment` | Yes | Must equal the value of the running k8-automation instance's `configuration.environment`
`ns` | No | Namespace to create the resources in, default is "default"
`imagePullSecret` | No | Name of the Kubernetes image pull secret, if omitted the deployment spec is not provided an image pull secret
`port` | No | Port the container service listens on, if omitted the deployment spec will have no configured liveness or readiness probe and no service will be created
`path` | No | Absolute path under the hostname the ingress controller should use for this service, if omitted no ingress rule is created
`host` | No | Host name to use in ingress rule, only has effect if `path` is provided, if omitted when `path` is provided, the rule is created under the wildcard host
`protocol` | No | Scheme to use when setting the URL for the service endpoint, "https" or "http", default is "http"
`deploymentSpec` | No | Stringified JSON Kubernetes deployment spec to overlay on top of default deployment spec, it only needs to contain the properties you want to add or override from the default
`serviceSpec` | No | Stringified JSON Kubernetes service spec to overlay on top of default service spec, it only needs to contain the properties you want to add or override from the default

## Support

General support questions should be discussed in the `#support`
channel in our community Slack team
at [atomist-community.slack.com][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/k8-automation/issues

## Development

Before developing this project, you will need to install Node.js and
configure your environment.

### Node.js

You will need to have [Node.js][node] installed.  To verify that the
right versions are installed, please run:

```console
$ node -v
v9.7.1
$ npm -v
5.6.0
```

The `node` version should be 8 or greater and the `npm` version should
be 5 or greater.

[node]: https://nodejs.org/ (Node.js)

### Cloning the repository and installing dependencies

To get started run the following commands to clone the project,
install its dependencies, and build the project:

```console
$ git clone git@github.com:atomist/k8-automation.git
$ cd k8-automation
$ npm install
$ npm run build
```

### Configuring your environment

If this is the first time you will be running an Atomist API client
locally, you should first configure your system using the `atomist`
script:

```console
$ `npm bin`/atomist config
```

The script does two things: records what Slack team you want your
automations running in and creates
a [GitHub personal access token][token] with "repo" and "read:org"
scopes.

The script will prompt you for your Atomist workspace/team ID, or you
can supply it using the `--team TEAM_ID` command-line option.  You can
get your Atomist team ID from the settings page for your Atomist
workspace or by typing `team` in a DM to the Atomist bot.

The script will prompt you for your GitHub credentials.  It needs them
to create the GitHub personal access token.  Atomist does not store
your credentials and only writes the generated token to your local
machine.

The Atomist API client authenticates using a GitHub personal access
token.  The Atomist API uses the token to confirm you are who you say
you are and are in a GitHub organization connected to the Slack team
in which you are running the automations.  In addition, it uses the
token when performing any operations that access the GitHub API.

[token]: https://github.com/settings/tokens (GitHub Personal Access Tokens)

### Running locally

You can run this automation client locally, allowing you to change the
source code of this project and immediately see the effects in your
environment with the following command

```console
$ npm run autostart
```

To run in a more traditional manner, build the project and then simple
start it.

```console
$ npm run build
$ npm start
```

To download and run the Docker image of this project, run the
following command

```console
$ docker run --rm -e GITHUB_TOKEN=YOUR_TOKEN -e ATOMIST_TEAMS=TEAM_ID \
    atomist/k8-automation:VERSION
```

replacing `YOUR_TOKEN` and `TEAM_ID` with the token and team ID from
your `~/.atomist/client.config.json` created by the `atomist config`
command and `VERSION` with the [latest release of this repo][latest].
Note that this will not be running any code from your local machine
but the code in the Docker image.

[latest]: https://github.com/atomist/k8-automation/releases/latest

### Build and Test

Command | Reason
------- | ------
`npm install` | install all the required packages
`npm run build` | lint, compile, and test
`npm start` | start the Atomist automation client
`npm run autostart` | run the client, refreshing when files change
`npm run lint` | run tslint against the TypeScript
`npm run compile` | compile all TypeScript into JavaScript
`npm test` | run tests and ensure everything is working
`npm run autotest` | run tests continuously
`npm run clean` | remove stray compiled JavaScript files and build directory

### Release

Releases are managed by the [Atomist SDM][atomist-sdm].  Press the
"Release" button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack team][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
