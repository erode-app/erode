# Changelog

## [0.7.0](https://github.com/erode-app/erode/compare/0.6.0...0.7.0) (2026-03-08)


### Features

* **core:** use gemini-2.5-pro as default advanced model ([#52](https://github.com/erode-app/erode/issues/52)) ([42178c9](https://github.com/erode-app/erode/commit/42178c9be2b214b893c0e57674ab3c8cf69035b9))


### Build System

* **deps-dev:** bump knip from 5.85.0 to 5.86.0 ([#51](https://github.com/erode-app/erode/issues/51)) ([ee831c6](https://github.com/erode-app/erode/commit/ee831c605c9a047f21b198aca16a7120137b3e8d))
* **deps:** bump the non-major-updates group with 4 updates ([#44](https://github.com/erode-app/erode/issues/44)) ([5dd8c76](https://github.com/erode-app/erode/commit/5dd8c766d2fe29397de7c7ababf16357df304f96))

## [0.6.0](https://github.com/erode-app/erode/compare/0.5.0...0.6.0) (2026-03-07)


### Features

* add erode check command, npm publishing, and Claude Code skill ([#39](https://github.com/erode-app/erode/issues/39)) ([712a642](https://github.com/erode-app/erode/commit/712a64238b97a00133a0c02e8554c6628be4a9b9))

## [0.5.0](https://github.com/erode-app/erode/compare/0.4.0...0.5.0) (2026-03-05)


### Features

* **web:** regenerate video with GIF and updated mocks ([c8a55ac](https://github.com/erode-app/erode/commit/c8a55ac499cdf7bca0d219ae0ffef970820eaac5))


### Bug Fixes

* harden input validation and sensitive data handling ([#35](https://github.com/erode-app/erode/issues/35)) ([8ac2424](https://github.com/erode-app/erode/commit/8ac2424f43fd108aab3aba2990f2a37be4affcad))
* loop HTML sanitization until stable to handle nested tags ([#37](https://github.com/erode-app/erode/issues/37)) ([123a1bd](https://github.com/erode-app/erode/commit/123a1bddcd1c3df01e6e20842c063908a9147337))
* **release:** use pull_request_target for dependabot auto-merge ([69e573c](https://github.com/erode-app/erode/commit/69e573cb8b83f26bfb6e4e9e1c074bb48faf06fd))
* support GitLab and Bitbucket repository URLs in adapters ([#36](https://github.com/erode-app/erode/issues/36)) ([8687790](https://github.com/erode-app/erode/commit/868779034eeac39a13aec3996105747dd7701803))


### Build System

* **deps:** bump @google/genai from 1.43.0 to 1.44.0 in the non-major-updates group ([#34](https://github.com/erode-app/erode/issues/34)) ([05a1395](https://github.com/erode-app/erode/commit/05a139501039b0fe9eb2429cca80ebcf7356cae9))
* **deps:** bump docker/login-action from 3 to 4 ([#30](https://github.com/erode-app/erode/issues/30)) ([bfd416b](https://github.com/erode-app/erode/commit/bfd416badb068b6ca6b0312d24e8c0a802e12e09))
* **deps:** bump docker/setup-qemu-action from 3 to 4 ([#31](https://github.com/erode-app/erode/issues/31)) ([baef1f4](https://github.com/erode-app/erode/commit/baef1f42c2f16dd2b28af65904bc7a81bf298ebb))
* **deps:** bump the non-major-updates group with 3 updates ([#29](https://github.com/erode-app/erode/issues/29)) ([d30efaa](https://github.com/erode-app/erode/commit/d30efaa02dc2973db73be0bb476e06b8d3284470))
* **deps:** upgrade eslint from v9 to v10 ([#28](https://github.com/erode-app/erode/issues/28)) ([5fd1589](https://github.com/erode-app/erode/commit/5fd158933c2926a41d6f336bce73d5ff5e289214))
* **release:** show build commits in release notes ([b10e0fb](https://github.com/erode-app/erode/commit/b10e0fbbab0e53a5207892564f23398ba8cbb53b))

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
