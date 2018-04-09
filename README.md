# @atomist/k8-automation

[![npm version](https://badge.fury.io/js/%40atomist%2Fk8-automation.svg)](https://badge.fury.io/js/%40atomist%2Fk8-automation)
[![Build Status](https://travis-ci.org/atomist/k8-automation.svg?branch=master)](https://travis-ci.org/atomist/k8-automation)
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
project provides, see the [Atomist documentation][docs].  For more
detailed information on developing automations, see
the [Atomist Developer Guide][dev].

[docs]: https://docs.atomist.com/ (Atomist User Guide)
[dev]: https://docs.atomist.com/developer/ (Atomist Developer Guide)

### GitHub account

You must have a GitHub account, either GitHub.com or GitHub Enterprise
(GHE).  If you want to use Atomist with GHE, please [contact
Atomist](mailto:support@atomist.com).  The remainder of these
instructions assume you have a GitHub.com account.  If you do not
already have a GitHub.com account, you can [create
one][github-create].

[github-create]: https://github.com/join (Join GitHub)

### Atomist workspace

You also need to sign up with Atomist and create a workspace.  Once
you have a GitHub.com account, you can sign up with Atomist at
[https://app.atomist.com/][atm-app].  Once you are registered with
Atomist, you can create an Atomist workspace and add your GitHub user
and/or organizations to that workspace.

[atm-app]: https://app.atomist.com/ (Atomist Web Interface)

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

### Slack

Atomist has a powerful [Slack][slackhq] application, allowing you to
see and act on your development activity right in Slack.  Slack is
_not_ a requirement for using Atomist, but if you try it, you'll
probably like it.  If you do not have access to a Slack team, it is
easy to [create your own][slack-team].

In your Slack team, install the Atomist app in Slack, click the button
below.

<p align="center">
 <a href="https://atm.st/2wiDlUe">
  <img alt="Add to Slack" height="50" width="174" src="https://platform.slack-edge.com/img/add_to_slack@2x.png" />
 </a>
</p>

Once installed, the Atomist bot will guide you through connecting
Atomist, Slack, and GitHub.

[slackhq]: https://slack.com/ (Slack)
[slack-team]: https://slack.com/get-started#create (Create a Slack Team)

## Running

The best way to run k8-automation is within the Kubernetes cluster
where you want it to manage deployments.  You can use the Kubernetes
resource files in the [kube directory][kube] as a starting point for
deploying k8vent in your kubernetes cluster.

k8-automation needs write access to service, deployment, and ingress
resources in your Kubernetes cluster to operate properly.  It uses the
Kubernetes "in-cluster client" to authenticate against the Kubernetes
API.  Depending on whether your cluster is using [role-based access
control (RBAC)][rbac] or not, you must deploy k8-automation slightly
differently.  RBAC is a feature of more recent versions of Kubernetes,
for example it is enabled by default on [GKE clusters][gke-rbac] using
Kubernetes 1.6 and higher.  If your cluster is older or is not using
RBAC, the default system account provided to all pods should have
sufficient permissions to run k8-automation.

Before deploying either with or without RBAC, you will need to create
a namespace for the k8-automation resources and a secret with the
k8-automation configuration.  The only required configuration values
are the `teamIds` and `token`, but you may also want to specify
`custom.hostUrl` so GitHub commit statuses with the service endpoint
have the proper URL.  The `teamIds` should be your Atomist team ID(s),
which you can get from the settings page for your Atomist workspace or
by sending `team` as a message to the Atomist bot, e.g., `@atomist team`,
in Slack.  The `token` should be a [GitHub personal access
token][ghpat] with `read:org` and `repo` scopes.

```console
$ kubectl apply -f https://raw.githubusercontent.com/atomist/k8-automation/master/assets/kube/namespace.yaml
$ kubectl create secret --namespace=k8-automation generic automation \
    --from-literal=config='{"teamIds":["TEAM_ID"],"token":"TOKEN"}'
```

In the above commands, replace `TEAM_ID` with your Atomist team ID,
and `TOKEN` with your GitHub token.

[kube]: ./assets/kube/ (k8-automation Kubernetes Resources)
[rbac]: https://kubernetes.io/docs/admin/authorization/rbac/ (Kubernetes RBAC)
[gke-rbac]: https://cloud.google.com/kubernetes-engine/docs/how-to/role-based-access-control (GKE RBAC)
[ghpat]: https://github.com/settings/tokens (GitHub Personal Access Tokens)

### RBAC

If your Kubernetes cluster uses RBAC (minikube does), you can deploy with the
following commands

```console
$ kubectl apply -f https://raw.githubusercontent.com/atomist/k8-automation/master/assets/kube/rbac.yaml
$ kubectl apply -f https://raw.githubusercontent.com/atomist/k8-automation/master/assets/kube/deployment-rbac.yaml
```

If you get the following error when running the first command,

```
Error from server (Forbidden): error when creating "rbac.yaml": clusterroles.rbac.authorization.k8s.io "k8-automation-clusterrole" is forbidden: attempt to grant extra privileges: [...] user=&{YOUR_USER  [system:authenticated] map[]} ownerrules=[PolicyRule{Resources:["selfsubjectaccessreviews"], APIGroups:["authorization.k8s.io"], Verbs:["create"]} PolicyRule{NonResourceURLs:["/api" "/api/*" "/apis" "/apis/*" "/healthz" "/swagger-2.0.0.pb-v1" "/swagger.json" "/swaggerapi" "/swaggerapi/*" "/version"], Verbs:["get"]}] ruleResolutionErrors=[]
```

then your Kubernetes user does not have administrative privileges on
your cluster.  You will either need to ask someone who has admin
privileges on the cluster to create the RBAC resources or try to
escalate your privileges with the following command.

```console
$ kubectl create clusterrolebinding cluster-admin-binding --clusterrole cluster-admin \
    --user YOUR_USER
```

If you are running on GKE, you can supply your user name using the
`gcloud` utility.

```console
$ kubectl create clusterrolebinding cluster-admin-binding --clusterrole cluster-admin \
    --user $(gcloud config get-value account)
```

Then run the command to create the `kube/rbac.yaml` resources again.

### Without RBAC

To deploy on clusters without RBAC, run the following commands

```console
$ kubectl apply -f https://raw.githubusercontent.com/atomist/k8vent/master/assets/kube/deployment-no-rbac.yaml
```

If the logs from the k8-automation pod have lines indicating a failure
to create, patch, or delete Kubernetes resources, then the default
service account does not have read permissions to pods and you likely
need to deploy using RBAC.

## SDM interface

The KubeDeploy event handler triggers off an SDM Goal with the
following properties:

JSON Path | Value
----------|------
`fulfillment.name` | @atomist/k8-automation
`fulfillment.method` | side-effect
`state` | requested
`environment` | equal to the value of the running k8-automation instance's `configuration.environment`

In addition, it expects the SDM Goal to have a `data` property that
when parsed as JSON has a `kubernetes` property whose value is an
object with the following properties:

Property | Required | Description
---------|----------|------------
`name` | Yes | Name of the resources that will be created
`ns` | No | Namespace to create the resources in, default is "default"
`imagePullSecret` | No | Name of the Kubernetes image pull secret, if omitted the deployment spec is not provided an image pull secret
`port` | No | Port the container service listens on, if omitted the deployment spec will have no configured liveness or readiness probe and no service will be created
`path` | No | Absolute path under the hostname the ingress controller should use for this service, if omitted no ingress rule is created
`host` | No | Host name to use in ingress rule, only has effect if `path` is provided, if omitted when `path` is provided, the rule is created under the wildcard host
`protocol` | No | Scheme to use when setting the URL for the service endpoint, "https" or "http", default is "http"
`deploymentSpec` | No | Kubernetes deployment spec to overlay on top of default deployment spec
`serviceSpec` | No | Kubernetes service spec to overlay on top of default service spec

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

To create a new release of the project, update the version in
package.json and then push a tag for the version.  The version must be
of the form `M.N.P` where `M`, `N`, and `P` are integers that form the
next appropriate [semantic version][semver] for release.  The version
in the package.json must be the same as the tag.  For example:

[semver]: http://semver.org

```console
$ npm version 1.2.3
$ git tag -a -m 'The ABC release' 1.2.3
$ git push origin 1.2.3
```

The Travis CI build (see badge at the top of this page) will publish
the NPM module and automatically create a GitHub release using the tag
name for the release and the comment provided on the annotated tag as
the contents of the release notes.

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack team][slack].

[atomist]: https://atomist.com/ (Atomist - Development Automation)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
