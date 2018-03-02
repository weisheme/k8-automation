# @atomist/k8-automation

[![npm version](https://badge.fury.io/js/%40atomist%2Fk8-automation.svg)](https://badge.fury.io/js/%40atomist%2Fk8-automation)
[![Build Status](https://travis-ci.org/atomist/k8-automation.svg?branch=master)](https://travis-ci.org/atomist/k8-automation)

This repository contains automations for deploying to Kubernetes using
the [Atomist][atomist] API.  These examples use the
[`@atomist/automation-client`][client] node module to implement a
local client that connects to the Atomist API.

[client]: https://github.com/atomist/automation-client-ts (@atomist/automation-client Node Module)

## Prerequisites

Below are brief instructions on how to get started running this
project yourself.  If you just want to use the functionality this
project provides, see the [Atomist documentation][docs].  For more
detailed information on developing automations, see
the [Atomist Developer Guide][dev].

[docs]: https://docs.atomist.com/ (Atomist User Guide)
[dev]: https://docs.atomist.com/developer/ (Atomist Developer Guide)

### Slack and GitHub

Atomist automations work best when connected to [Slack][slackhq]
and [GitHub][gh].  If you do not have access to a Slack team and/or
GitHub organization, it is easy to create your own.

-   Create a [Slack team][slack-team]
-   Create a [GitHub organization][gh-org]

In your Slack team, install the Atomist app in Slack, click the button
below.

<p align="center">
 <a href="https://atm.st/2wiDlUe">
  <img alt="Add to Slack" height="50" width="174" src="https://platform.slack-edge.com/img/add_to_slack@2x.png" />
 </a>
</p>

Once installed, the Atomist bot will guide you through connecting
Atomist, Slack, and GitHub.

If you'd rather not set up your own Slack team and GitHub
organization, please reach out to members of Atomist in the `#support`
channel of [atomist-community Slack team][slack].  You'll receive an
invitation to a [Slack team][play-slack]
and [GitHub organization][play-gh] that can be used to explore this
new approach to writing and running automations.

> _The Slack team ID for atomist-playground is `T7GMF5USG`._

[slackhq]: https://slack.com/ (Slack)
[gh]: https://github.com/ (GitHub)
[slack-team]: https://slack.com/get-started#create (Create a Slack Team)
[gh-org]: https://github.com/account/organizations/new (Create a GitHub Organization)
[play-slack]: https://atomist-playground.slack.com (Atomist Playground Slack)
[play-gh]: https://github.com/atomist-playground (Atomist Playground GitHub Organization)

### Node.js

You will need to have [Node.js][node] installed.  To verify that the
right versions are installed, please run:

```console
$ node -v
v8.4.0
$ npm -v
5.4.1
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

The script will prompt you for you Slack team ID, or you can supply it
using the `--slack-team TEAM_ID` command-line option.  You must run
the automations in a Slack team of which you are a member.  You can
get the Slack team ID by typing `team` in a DM to the Atomist bot.

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
a namespace for the k8-automation resources and a secret with your
Atomist team ID and GitHub personal access token.  If you have
followed the instructions above, both pieces of information will be
available in the `client.config.json` file in the `.atomist` directory
in your home directory.  You can create the namespace and secret with
the following commands.

```console
$ kubectl apply -f https://raw.githubusercontent.com/atomist/k8-automation/master/assets/kube/namespace.yaml
$ kubectl create secret generic automation-config \
    --from-literal=teamId="$(jq -r '.teamIds[0]' "$HOME/.atomist/client.config.json")" \
    --from-literal=githubToken="$(jq -r .token "$HOME/.atomist/client.config.json")"
```

If you prefer, you can create your own GitHub personal access token
with "repo" and "read:org" scopes and get your team ID from
https://app.atomist.com/teams or by sending `team` as a message to the
Atomist bot, e.g., `@atomist team`, in Slack.

[kube]: ./assets/kube/ (k8-automation Kubernetes Resources)
[rbac]: https://kubernetes.io/docs/admin/authorization/rbac/ (Kubernetes RBAC)
[gke-rbac]: https://cloud.google.com/kubernetes-engine/docs/how-to/role-based-access-control (GKE RBAC)

### RBAC

If your Kubernetes cluster uses RBAC, you can deploy with the
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

## Support

General support questions should be discussed in the `#support`
channel in our community Slack team
at [atomist-community.slack.com][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/k8-automation/issues

## Development

You will need to install [node][] to build and test this project.

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
$ docker run --rm -e GITHUB_TOKEN=YOUR_TOKEN -e ATOMIST_TEAM=TEAM_ID \
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
