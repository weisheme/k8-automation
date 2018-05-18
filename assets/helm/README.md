# k8-automation Helm chart

[Helm][helm] chart for [k8-automation][], a utility that responds to
[Atomist][atomist] software delivery machine (SDM) events to deploy
and undeploy resources from Kubernetes using the Atomist
[automation][] API.

[helm]: https://helm.sh/ (Helm - Package Manager for Kubernetes)
[k8-automation]: https://github.com/atomist/k8-automation (k8-automation - Atomist Kubernetes deployer)
[automations]: https://github.com/atomist/automation-client-ts (Atomist Automation Client)

## Prerequisites

### GitHub account

You must have a GitHub account, either GitHub.com or GitHub Enterprise
(GHE).  If you want to use Atomist with GHE, please [contact
Atomist](mailto:support@atomist.com).  The remainder of these
instructions assume you have a GitHub.com account.  If you do not
already have a GitHub.com account, you can [create
one][github-create].

To run automations, you will need a GitHub [personal access
token][token] with "read:org" scope.  You can create one yourself or
use the Atomist CLI to do it for you (see below).

[github-create]: https://github.com/join (Join GitHub)
[token]: https://github.com/settings/tokens (GitHub Personal Access Tokens)

### Atomist workspace

You also need to sign up with Atomist and create a workspace.  Once
you have a GitHub.com account, you can sign up with Atomist at
[https://app.atomist.com/][atm-app].  Once you are registered with
Atomist, you can create an Atomist workspace and add your GitHub user
and/or organizations to that workspace.

Once you have created your Atomist workspace, take note of your
Atomist workspace/team ID.  You can always find your Atomist workspace
ID on the workspace's settings page or, if you have added the Atomist
app to Slack, you can send the Atomist bot the message `team` and it
will tell you the workspace/team ID.

[atm-app]: https://app.atomist.com/ (Atomist Web Interface)

## Values

See [values.yaml](values.yaml).

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack team][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
