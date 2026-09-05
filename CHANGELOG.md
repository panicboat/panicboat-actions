# Changelog

## [0.1.1](https://github.com/panicboat/panicboat-actions/compare/v0.1.0...v0.1.1) (2026-09-05)


### Bug Fixes

* **auto-approve:** use hmarr/auto-approve-action instead of a deleted local action ([#38](https://github.com/panicboat/panicboat-actions/issues/38)) ([1a07e94](https://github.com/panicboat/panicboat-actions/commit/1a07e940a623dff22628b55947505c7f2ed900f7))
* **terragrunt-run:** let aqua discover the caller's config instead of pinning its path ([#36](https://github.com/panicboat/panicboat-actions/issues/36)) ([92bfcb0](https://github.com/panicboat/panicboat-actions/commit/92bfcb0053f35fc2b1165f86d65f8085eca7dff8))

## 0.1.0 (2026-05-16)


### Features

* add reusable workflows for terragrunt / container / kubernetes builds ([#4](https://github.com/panicboat/panicboat-actions/issues/4)) ([11102e4](https://github.com/panicboat/panicboat-actions/commit/11102e42e64bf4dc189f157c1a3e417894e0a32e))
* **ci:** release-please workflow を追加 ([#12](https://github.com/panicboat/panicboat-actions/issues/12)) ([afe2049](https://github.com/panicboat/panicboat-actions/commit/afe20497f67ae5a44292069df8c1b0b6994da208))
* import composite actions from deploy-actions ([18b64df](https://github.com/panicboat/panicboat-actions/commit/18b64df3636094b886ef900567c4d54240434ac0))
* **terragrunt-run:** add workflow run link to PR comments ([#5](https://github.com/panicboat/panicboat-actions/issues/5)) ([56c5fe5](https://github.com/panicboat/panicboat-actions/commit/56c5fe55e3f8e567c73e698927485aa00870ea8e))


### Bug Fixes

* **ci:** release-please の初期 version を 0.1.0 に修正 ([#14](https://github.com/panicboat/panicboat-actions/issues/14)) ([75823cd](https://github.com/panicboat/panicboat-actions/commit/75823cddc555f5a35d74a279e28ed208136b65ed))
* **ci:** run lint-actions on every PR (Required check needs to register) ([#8](https://github.com/panicboat/panicboat-actions/issues/8)) ([59b545c](https://github.com/panicboat/panicboat-actions/commit/59b545c31107530786232a2121cace451a5a3649))
* **terragrunt-run:** link to specific job and render truncation notice ([#9](https://github.com/panicboat/panicboat-actions/issues/9)) ([f917fa0](https://github.com/panicboat/panicboat-actions/commit/f917fa0921e06ec7b08941df04958361c43253fb))
