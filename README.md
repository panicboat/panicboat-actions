# panicboat-actions

**English** | [🇯🇵 日本語](README-ja.md)

Personal-use GitHub Actions composite wrappers for panicboat infrastructure.

## Overview

This repository hosts composite actions tailored to the maintainer's environments. Anyone is free to read or fork them, but the wrappers embed assumptions specific to panicboat's AWS account, IAM roles, and deployment conventions, so they are not designed for general consumption.

## Available actions

- `auto-approve/` — Auto-approve and merge bot PRs.
- `claude-code-action/` — Run Claude Code via AWS Bedrock for repository automation.
- `container-builder/` — Build and push container images to GHCR.
- `container-cleaner/` — Clean up untagged container images on GHCR.
- `kubernetes/` — Build kustomize overlays and post diff as a PR comment.
- `terragrunt/` — Execute Terragrunt plan/apply with AWS OIDC.

## Related

- [panicboat/deploy-actions](https://github.com/panicboat/deploy-actions) — Generic deployment orchestration (label-dispatcher, label-resolver, config-manager) reused as upstream.
