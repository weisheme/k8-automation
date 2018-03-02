# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased][]

[Unreleased]: https://github.com/atomist/k8-automation/compare/0.3.0...HEAD

### Added

-   Set ATOMIST_ENVIRONMENT variable in deployment pod container [#7][7]
-   Undeploy handler [#6][6]

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
