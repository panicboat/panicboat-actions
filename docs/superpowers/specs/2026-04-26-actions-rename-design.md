# panicboat-actions rename and reorganization

## Goal

panicboat-actions に存在する 6 つの composite action のうち、実態と名前のズレ・不要なものを整理する。残す action は B 規則 (`<対象>-<動詞>`) で命名統一する。

## Current state

panicboat-actions に以下 6 つの composite action が存在する。

| ディレクトリ | `name:` | 実際の機能 | 主な参照元 |
|---|---|---|---|
| `auto-approve/` | Auto-Approve and Merge | PR を承認 + 条件付きマージ | monorepo, platform |
| `claude-code-action/` | Claude Code Action | Bedrock 経由で Claude Code 実行 | panicboat-actions, monorepo, platform |
| `container-builder/` | Container Builder | GHCR への build & push | monorepo |
| `container-cleaner/` | Container Cleaner | GHCR の古いイメージ削除 | monorepo |
| `kubernetes/` | Kubernetes Diff | kustomize overlay の PR diff コメント | monorepo, platform |
| `terragrunt/` | Terragrunt Action with AWS OIDC | terragrunt plan/apply + PR コメント | monorepo, platform |

実態と名前の主な乖離:

- `auto-approve` は実態がマージで、approve はその前段に過ぎない
- `claude-code-action` は `panicboat-actions/claude-code-action` の参照で "action" が二重になる
- `kubernetes` という名前は広く、実態（kustomize の diff）を表していない
- `terragrunt` の `name:` ("Terragrunt Action with AWS OIDC") が他と粒度が揃わない
- `github-token` (kubernetes, terragrunt) と `token` (他 4 つ) の表記揺れ
- `terragrunt` の `inputs.repository` は呼び元で常に `${{ github.repository }}` 固定で不要
- `auto-approve`, `container-builder`, `container-cleaner` は panicboat-actions に置く必然性が薄い
  - `auto-approve` は実質 `hmarr/auto-approve-action` の薄いラッパー
  - `container-builder/cleaner` は monorepo からしか使われていない

## Decisions

1. 残す action は 3 つ。命名規則は `<対象>-<動詞>` 形に統一する。
2. 削除する action は 3 つ。代替手段を呼び元側に直書きする。
3. 内容整理は各 action 単体で完結させる。共通処理を別 composite に切り出すことはしない。
4. 破壊的変更となるため、@main 参照の下流（monorepo, platform, panicboat-actions 自身）も同期して更新する。

## Renamed actions

panicboat-actions に残す 3 つを以下にリネームする。

| 現在 | 新名称 | `name:` |
|---|---|---|
| `claude-code-action/` | `claude-run/` | Claude Run |
| `kubernetes/` | `kustomize-diff/` | Kustomize Diff |
| `terragrunt/` | `terragrunt-run/` | Terragrunt Run |

## Removed actions

以下 3 つは panicboat-actions から削除する。

| 削除対象 | 代替 |
|---|---|
| `auto-approve/` | 利用元 workflow で `hmarr/auto-approve-action@v4` を直接呼ぶ。マージ機能は廃止 |
| `container-builder/` | `monorepo/.github/workflows/reusable--container-builder.yaml` に step を直書き |
| `container-cleaner/` | `monorepo/.github/workflows/cleanup-container-image.yaml` に step を直書き |

`auto-approve` のマージ機能 (`auto-merge-label: 'automerge'` ラベルでマージ) は完全廃止する。必要であれば GitHub リポジトリ設定の "Allow auto-merge" に寄せる。

## Per-action changes

### claude-run (旧 `claude-code-action/`)

- `name:` を "Claude Run" に変更
- `description:` を "Run Claude Code via AWS Bedrock" に短縮
- `aws-role-arn` のデフォルト値（`ai-assistant-develop` ハードコード）は**現状維持**
- step 名・コメントの整理
- 機能・他 input・ロジックは変更しない

### kustomize-diff (旧 `kubernetes/`)

- `name:` を "Kustomize Diff" に変更
- `description:` を "Build kustomize overlays and post diff as a PR comment" に整理
- input `github-token` → `token` にリネーム（`token` 系統に統一）
- input `path` は**現状維持**
- step 名整理
- 機能・ロジックは変更しない

### terragrunt-run (旧 `terragrunt/`)

- `name:` を "Terragrunt Run" に変更
- `description:` を "Execute terragrunt plan or apply with AWS OIDC" に短縮
- input `github-token` → `token` にリネーム
- input `repository` 削除（呼び元で常に `${{ github.repository }}` 固定。`actions/checkout` のデフォルト挙動で同等）
- step 名・コメント整理
- 機能・他 input・ロジックは変更しない

## Downstream updates

### panicboat-actions 自身

- `.github/workflows/claude-code-action.yaml`
  - `panicboat-actions/claude-code-action@main` → `panicboat-actions/claude-run@main`
- `README.md` / `README-ja.md`
  - 残る 3 アクション（`claude-run`, `kustomize-diff`, `terragrunt-run`）のみに整理
  - `auto-approve`, `container-builder`, `container-cleaner` の記述を削除

### monorepo

- `.github/workflows/auto-approve.yaml`
  - `panicboat-actions/auto-approve@main` 参照を削除
  - `hmarr/auto-approve-action@v4.0.0` を直接呼ぶ step に置換
  - `auto-merge-label: 'automerge'` の指定とマージ step を削除
- `.github/workflows/claude-code-action.yaml`
  - `panicboat-actions/claude-code-action@main` → `panicboat-actions/claude-run@main`
- `.github/workflows/reusable--kubernetes-builder.yaml`
  - `panicboat-actions/kubernetes@main` → `panicboat-actions/kustomize-diff@main`
  - `github-token:` → `token:` に書き換え
- `.github/workflows/reusable--terragrunt-executor.yaml`
  - `panicboat-actions/terragrunt@main` → `panicboat-actions/terragrunt-run@main`
  - `github-token:` → `token:` に書き換え
  - `repository:` 行を削除
- `.github/workflows/reusable--container-builder.yaml`
  - `panicboat-actions/container-builder@main` 参照を削除
  - 同等の step（checkout / docker login / buildx / metadata / build-push）を直書き
- `.github/workflows/cleanup-container-image.yaml`
  - `panicboat-actions/container-cleaner@main` 参照を削除
  - 同等の step（`dataaxiom/ghcr-cleanup-action` 3 連続呼び出し）を直書き
- `.github/workflows/auto-label--deploy-trigger.yaml`
  - コメントアウト中の `panicboat-actions/container-cleaner@main` 参照を整理（削除またはコメント本文の更新）

### platform

- `.github/workflows/auto-approve.yaml`
  - monorepo と同じ修正（`hmarr/auto-approve-action@v4.0.0` 直呼び化、マージ廃止）
- `.github/workflows/claude-code-action.yaml`
  - `panicboat-actions/claude-code-action@main` → `panicboat-actions/claude-run@main`
- `.github/workflows/reusable--kubernetes-builder.yaml`
  - monorepo と同じ修正
- `.github/workflows/reusable--terragrunt-executor.yaml`
  - monorepo と同じ修正

## Migration sequence

`@main` 参照のため、panicboat-actions 側のディレクトリリネームと下流の参照更新を一気に切ると CI が壊れる。3 段階に分ける。

1. **panicboat-actions に新ディレクトリを追加**
   - 旧ディレクトリ（`auto-approve/`, `claude-code-action/`, `container-builder/`, `container-cleaner/`, `kubernetes/`, `terragrunt/`）はそのまま残す
   - 新ディレクトリ（`claude-run/`, `kustomize-diff/`, `terragrunt-run/`）を追加
   - panicboat-actions 自身の `.github/workflows/claude-code-action.yaml` は新名称に更新
   - これを `main` にマージ
2. **下流（monorepo, platform）の参照を新名称に切替**
   - 上記 "Downstream updates" の monorepo / platform 側の修正をすべて適用
   - 各 repo で main にマージ
3. **panicboat-actions の旧ディレクトリと不要 action を削除**
   - `auto-approve/`, `claude-code-action/`, `container-builder/`, `container-cleaner/`, `kubernetes/`, `terragrunt/` を削除
   - README.md / README-ja.md を最終形に更新
   - これを main にマージ

各段階のマージ後は短時間でも `@main` 参照が壊れない状態が保たれる。

## Testing

`act` (v0.2.87) を使ってローカルで syntax + early steps まで検証する。act で実行困難な範囲（外部 API 呼び出し）は移行段階 2 の実 PR で smoke test する。

### Local verification with act

各 action を呼ぶ test workflow を `.github/workflows/test--<name>.yaml` に置き、`act` で起動する。test workflow はリポジトリにコミットしない（ローカルの未コミット変更として保持）。

検証対象:

- `claude-run`: 起動 → checkout → AWS configure-credentials の手前で OIDC エラーになる手前まで。action.yaml の syntax と input 展開を確認
- `kustomize-diff`: 起動 → checkout (base/head) → kustomize build → diff まで実行可能。PR コメント step は GitHub API でこけるが許容
- `terragrunt-run`: 起動 → validate-working-directory.js → AWS configure-credentials の手前まで
- `auto-approve.yaml` の代替（`hmarr/auto-approve-action@v4` 直呼び）: 起動確認のみ。承認 API はこける
- `reusable--container-builder.yaml` の直書き step: docker buildx setup までは到達。GHCR push でこけるが許容
- `cleanup-container-image.yaml` の直書き step: `dataaxiom/ghcr-cleanup-action` の起動と input 展開を確認

合格基準: act が action.yaml をパースし job が起動、外部 API/AWS/GHCR 呼び出しの直前 step まで到達すること。

### Smoke test in actual workflows

移行段階 2 で monorepo / platform に PR を作り、GitHub Actions 上で各 workflow を実行して end-to-end の挙動を確認する。

- monorepo に test PR を出して以下を発火:
  - `auto-approve.yaml` (bot PR シミュレーション or 手動条件緩和)
  - `claude-code-action.yaml` (`@claude` コメントトリガー)
  - `reusable--kubernetes-builder.yaml` (kustomize 配下を変更)
  - `reusable--terragrunt-executor.yaml` (terragrunt 配下を変更)
  - `reusable--container-builder.yaml` (Dockerfile 配下を変更)
  - `cleanup-container-image.yaml` (cron または手動 dispatch)
- platform でも同様に PR を出して `auto-approve` / `claude-code-action` / `reusable--kubernetes-builder` / `reusable--terragrunt-executor` を発火
- 失敗があれば段階 2 内で修正してから段階 3（旧ディレクトリ削除）に進む

## Out of scope

- 共通処理（PR コメント、AWS OIDC 設定）の別 composite action への抽出（YAGNI 判断）
- `claude-run` の `aws-role-arn` デフォルト値変更
- `kustomize-diff` の `path` input リネーム
- 各 action の機能追加・削除
- semver タグ運用（現状 `@main` 参照のため）

## Risks

- 段階 1 と段階 2 の間で旧 action の使用を続ける期間に新 action の挙動バグが出ると、両方をメンテする必要がある（短期間で段階 2 を回せば緩和）
- 段階 2 で複数 repo の workflow を一括変更するため、CI 失敗が同時多発する可能性（PR 単位で個別に確認する）
- `auto-approve` のマージ廃止により、bot PR の自動マージ運用が止まる（GitHub の "Allow auto-merge" 設定で代替するかは別途判断）
- `terragrunt` の `repository` 削除は `actions/checkout` のデフォルト挙動依存。同 repo 内で完結することを前提とする
