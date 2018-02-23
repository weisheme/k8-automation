# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased][]

[Unreleased]: https://github.com/atomist/k8-automation/compare/0.2.0...HEAD

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
