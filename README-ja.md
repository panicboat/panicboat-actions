# panicboat-actions

[🇺🇸 English](README.md) | **日本語**

panicboat の環境向けに作った個人用 GitHub Actions composite wrapper 集。

## 概要

メンテナーの環境（panicboat の AWS アカウント、IAM ロール、デプロイ規約）を前提とした composite action を集めたリポジトリ。誰でも読んだり fork したりできますが、汎用的な利用は想定していません。

## 提供 Action

- `claude-run/` — AWS Bedrock 経由で Claude Code を実行
- `kustomize-diff/` — kustomize overlay を build して PR に diff をコメント
- `terragrunt-run/` — AWS OIDC で Terragrunt の plan/apply を実行

## 関連

- [panicboat/deploy-actions](https://github.com/panicboat/deploy-actions) — 汎用デプロイメント・オーケストレーション（label-dispatcher / label-resolver / config-manager）。本リポジトリの上流として利用される。
