# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased][]

[Unreleased]: https://github.com/atomist/k8-automation/compare/0.8.0...HEAD

## [0.8.0][] - 2018-05-18

[0.8.0]: https://github.com/atomist/k8-automation/compare/0.7.3...0.8.0

Helm release

### Fixed

-   Always use supplied deployment patch, even when patching
-   Make SdmGoal description more user friendly
-   Added metadata to patches so specs can reference its fields

### Added

-   Support replicas in SDM goal data
-   Helm charts

## [0.7.3][] - 2018-05-01

[0.7.3]: https://github.com/atomist/k8-automation/compare/0.7.2...0.7.3

Mayday release

### Changed

-   Remove async/await

## [0.7.2][] - 2018-04-27

[0.7.2]: https://github.com/atomist/k8-automation/compare/0.7.1...0.7.2

Merge release

### Changed

-   Remove environment variables from deployment spec template

## [0.7.1][] - 2018-04-27

[0.7.1]: https://github.com/atomist/k8-automation/compare/0.7.0...0.7.1

Merge release

### Changed

-   Use standard merge when combining default and provided Kubernetes
    resource specs

## [0.7.0][] - 2018-04-18

[0.7.0]: https://github.com/atomist/k8-automation/compare/0.6.3...0.7.0

SDM release

### Changed

-   **BREAKING** Migrate from GitHub commit statuses to SDM goals [#12][12]
-   **BREAKING** Convert KubeUndeploy to a command handler
-   **BREAKING** Custom configuration is now obtained from the SDM
    goal, not the automation configuration

### Removed

-   **BREAKING** Support for Google Container Builder

### Fixed

-   Always check for existing resources [#8][8]
-   Always update goal [#9][9]
-   Support deploying arbitrary containers [#10][10]
-   Use hostname in ingress rule [#11][11]

[8]: https://github.com/atomist/k8-automation/issues/8
[9]: https://github.com/atomist/k8-automation/issues/9
[10]: https://github.com/atomist/k8-automation/issues/10
[11]: https://github.com/atomist/k8-automation/issues/11
[12]: https://github.com/atomist/k8-automation/issues/12

## [0.6.3][] - 2018-04-05

[0.6.3]: https://github.com/atomist/k8-automation/compare/0.6.2...0.6.3

Token release

### Added

-   Debug statement

## [0.6.2][] - 2018-04-05

[0.6.2]: https://github.com/atomist/k8-automation/compare/0.6.1...0.6.2

Client release

### Changed

-   Updated to @atomist/automation-client@0.12.1

## [0.6.1][] - 2018-03-30

[0.6.1]: https://github.com/atomist/k8-automation/compare/0.6.0...0.6.1

Logzio release

### Changed

-   Added hostname to logzio metadata
-   Moved logzio token config to custom from logging.custom

## [0.6.0][] - 2018-03-28

[0.6.0]: https://github.com/atomist/k8-automation/compare/0.5.3...0.6.0

Custom release

### Added

-   `imagePullSecret` and `namespace` custom configuration

### Changed

-   Updated to new automation-client configuration

### Fixed

-   Logzio configuration

## [0.5.3][] - 2018-03-05

[0.5.3]: https://github.com/atomist/k8-automation/compare/0.5.2...0.5.3

Lowercase release

### Changed

-   Attempt to always include error information on failure of build
    handler

### Fixed

-   Support GitHub.com owners and repositories that do not conform to
    docker image name and tag restrictions

## [0.5.2][] - 2018-03-03

[0.5.2]: https://github.com/atomist/k8-automation/compare/0.5.1...0.5.2

Retry release

### Added

-   Retry to Kubernetes API calls

## [0.5.1][] - 2018-03-02

[0.5.1]: https://github.com/atomist/k8-automation/compare/0.5.0...0.5.1

Log release

### Added

-   More logging

## [0.5.0][] - 2018-03-02

[0.5.0]: https://github.com/atomist/k8-automation/compare/0.4.0...0.5.0

I/O release

### Changed

-   Use sdm.atomist.io for endpoint hostname

### Added

-   Kubernetes resource specifications and deployment instructions
-   Rate limiting annotations to ingress controllers

## [0.4.0][] - 2018-03-02

[0.4.0]: https://github.com/atomist/k8-automation/compare/0.3.0...0.4.0

Un release

### Added

-   Set ATOMIST_ENVIRONMENT variable in deployment pod container [#7][7]
-   Un-deploy handler [#6][6]

[7]: https://github.com/atomist/k8-automation/issues/7
[6]: https://github.com/atomist/k8-automation/issues/6

## [0.3.0][] - 2018-03-01

[0.3.0]: https://github.com/atomist/k8-automation/compare/0.2.6...0.3.0

Environment release

### Changed

-   Minor update to repo-image deployment pod template annotation
-   Add environment to pod k8vent annotation

## [0.2.6][] - 2018-02-27

[0.2.6]: https://github.com/atomist/k8-automation/compare/0.2.5...0.2.6

Host release

### Fixed

-   No longer lose host from ingress rules

## [0.2.5][] - 2018-02-26

[0.2.5]: https://github.com/atomist/k8-automation/compare/0.2.4...0.2.5

Annotation release

### Changed

-   Moved deployment annotations to pod
-   Return signed URL to build logs rather than console URL

## [0.2.4][] - 2018-02-24

[0.2.4]: https://github.com/atomist/k8-automation/compare/0.2.3...0.2.4

Build URL release

### Fixed

-   Build status description/URL mixup

## [0.2.3][] - 2018-02-24

[0.2.3]: https://github.com/atomist/k8-automation/compare/0.2.2...0.2.3

Working release

### Fixed

-   ingress-nginx configuration

## [0.2.2][] - 2018-02-23

[0.2.2]: https://github.com/atomist/k8-automation/compare/0.2.1...0.2.2

DOM release

### Fixed

-   Fix reference to build status in log message

## [0.2.1][] - 2018-02-23

[0.2.1]: https://github.com/atomist/k8-automation/compare/0.2.0...0.2.1

Spoon release

### Fixed

-   Do not fork bomb builds

## [0.2.0][] - 2018-02-23

[0.2.0]: https://github.com/atomist/k8-automation/compare/0.1.1...0.2.0

Ingress release

### Changed

-   Use nginx-ingress rather than default for GKE
-   Get branch from commit status context

### Added

-   Update deploy commit status with state and endpoint URL

## [0.1.1][] - 2018-02-22

[0.1.1]: https://github.com/atomist/k8-automation/compare/0.1.0...0.1.1

Secret release

### Fixed

-   Use secret aware start script

## [0.1.0][] - 2018-02-22

Initial release

[0.1.0]: https://github.com/atomist/k8-automation/tree/0.1.0

### Added

-   Google Container Builder CI [#3][3]
-   GKE deployment [#1][1]

[3]: https://github.com/atomist/k8-automation/issues/3
[1]: https://github.com/atomist/k8-automation/issues/1
