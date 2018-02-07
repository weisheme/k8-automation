# @atomist/k8-automation

[![npm version](https://badge.fury.io/js/%40atomist%2Fk8-automation.svg)](https://badge.fury.io/js/%40atomist%2Fk8-automation)
[![Build Status](https://travis-ci.org/atomist/k8-automation.svg?branch=master)](https://travis-ci.org/atomist/k8-automation)

This repository contains examples demonstrating use of
the [Atomist][atomist] API.  You will find examples illustrating:

-   Creating bot commands using _command handlers_
-   Responding to DevOps events, e.g., commits pushed to a repository,
    using _event handlers_

These examples use the [`@atomist/automation-client`][client] node
module to implement a local client that connects to the Atomist API.

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

## Starting up the automation-client

You can run this repository locally, allowing you to change the source
code of this project and immediately see the effects in your environment
with the following command

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

To run the Docker image in a Kubernetes cluster, you can use the
[deployment spec](k8-automation-deployment.json) from this
repository, replacing `YOUR_TOKEN`, `TEAM_ID` (twice!), and `VERSION`
in the spec as above in the Docker run command, and running the
following command

```console
$ kubectl create -f automation-seed-deployment.json
```

[latest]: https://github.com/atomist/k8-automation/releases/latest

## Support

General support questions should be discussed in the `#support`
channel in our community Slack team
at [atomist-community.slack.com][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/k8-automation/issues

## Development

You will need to install [node][] to build and test this project.

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
