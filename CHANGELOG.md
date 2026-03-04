# Changelog

## [0.4.0](https://github.com/erode-app/erode/compare/0.3.0...0.4.0) (2026-03-04)


### Features

* **web:** add mock GitHub screenshots for product video ([#23](https://github.com/erode-app/erode/issues/23)) ([6e17d43](https://github.com/erode-app/erode/commit/6e17d43767c0c96b00f8fd1eb9e9802396659813))
* **web:** add video section to landing page and README ([61f9423](https://github.com/erode-app/erode/commit/61f9423bbbbbe73a9b20859e7a2e1881d8e86969))
* **web:** improve video text readability and slide pacing ([913093c](https://github.com/erode-app/erode/commit/913093c02e5b3a8e2e44f91d66ec500fdc7fd00d))


### Code Refactoring

* **cli:** replace ink/react with plain console output ([#25](https://github.com/erode-app/erode/issues/25)) ([aa616fd](https://github.com/erode-app/erode/commit/aa616fd88d4b14c6088ab2544f975e3bbe333f7f))

## [0.3.0](https://github.com/erode-app/erode/compare/0.2.0...0.3.0) (2026-03-03)


### Features

* **core:** deterministic model patching, new component detection, and remote model repo support ([#15](https://github.com/erode-app/erode/issues/15)) ([d024e26](https://github.com/erode-app/erode/commit/d024e265bd31b36eab7db0f668186b48f2962b18))


### Bug Fixes

* **core:** handle 403 on locked PR conversations gracefully ([#18](https://github.com/erode-app/erode/issues/18)) ([e08089f](https://github.com/erode-app/erode/commit/e08089fb75eaa1591fedb68104cfb3e008a7f764))

## [0.2.0](https://github.com/erode-app/erode/compare/erode-monorepo-0.1.1...erode-monorepo-0.2.0) (2026-02-28)


### Features

* add docs-voice skill for documentation tone enforcement ([a472f0a](https://github.com/erode-app/erode/commit/a472f0ace78f441b902e498c111330231a6b2e5a))
* **web:** add nginx caching and security headers ([fb2ad49](https://github.com/erode-app/erode/commit/fb2ad49fd20270cbc8c851e529bf749cfc22d81f))


### Bug Fixes

* declare TARGETPLATFORM ARG in Dockerfile stages ([9f2feb9](https://github.com/erode-app/erode/commit/9f2feb935ff2e5655b005060835b324eb43caab2))
* isolate npm cache per platform in Docker multi-platform builds ([a37d10e](https://github.com/erode-app/erode/commit/a37d10e91ac67c4316ef1f2f22b80bb3b6d2c329))
* pin Docker image to erode:0 instead of latest ([824b7df](https://github.com/erode-app/erode/commit/824b7dfb3823622a95f4ed192af00f95c6a2b5a4))
* rename GitHub Action for Marketplace publishing ([7e48086](https://github.com/erode-app/erode/commit/7e480867334975f84e73bd47e425a80618926c1b))
