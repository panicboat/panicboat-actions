# terragrunt-run Actions Log Link

## Background

`terragrunt-run` の PR コメントは、Terragrunt の出力が 30,000 文字を超えると [terragrunt-run/parse-results.js:61](../../../terragrunt-run/parse-results.js) で truncate され、末尾に以下の文字列が付与される。

```
... (output truncated, see workflow logs for full details)
```

このメッセージはプレーンテキストかつ ```` ```hcl ... ``` ```` のコードブロック内に配置されているため、ユーザーは該当 Run を手動で探す必要がある。GitHub Actions のログまで遷移する導線が貧弱で、特に複数のサービス・環境をまたぐワークフローでは原因調査の摩擦が大きい。

`kustomize-diff` と `claude-run` は同じ問題を持たない。前者は `int128/diff-action@v2` が `comment-body` 出力に Workflow Run リンクを既に埋め込んでおり、後者は `anthropics/claude-code-action` のラッパーで独自のコメント生成ロジックを持たないため。

## Goals

- truncate 発生時に PR コメントから 1 クリックで該当 Workflow Run のログに遷移できる。
- truncate されていない場合でも、PR コメントから Workflow Run へ遷移できる常設導線を持つ。
- 既存の出力フォーマット（service / environment / status / output）を壊さない。

## Non-Goals

- Job 単位リンク (`/actions/runs/{run_id}/job/{job_id}`) への遷移。numeric job ID は GitHub API 経由でしか取得できず、追加の API 呼び出しが必要なため見送る。Run リンク経由でユーザーが該当 Job までスクロールする運用とする。
- `kustomize-diff` および `claude-run` への変更。
- truncate しきい値（30,000 文字）の調整。

## Design

### 1. PR Comment Header Link

[terragrunt-run/action.yaml](../../../terragrunt-run/action.yaml) の PR コメントテンプレートに、Workflow Run リンクを 1 行追加する。GitHub Actions の `github` コンテキスト（`github.server_url` / `github.repository` / `github.run_id`）から URL を組み立てる。

```yaml
message: |
  ## 🏗️ Terragrunt ${{ inputs.action-type }} Results

  **Service**: `${{ inputs.service-name }}`
  **Environment**: `${{ inputs.environment }}`
  **Status**: ${{ steps.parse-results.outputs.status }}
  **Workflow Run**: [#${{ github.run_id }}](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})

  <details>
  <summary>📋 Terragrunt Output</summary>

  ```hcl
  ${{ steps.parse-results.outputs.output }}
  ```
  </details>
  ${{ steps.parse-results.outputs.truncation-notice }}
```

### 2. Truncation Notice With Inline Link

[terragrunt-run/parse-results.js](../../../terragrunt-run/parse-results.js) を以下の通り変更する。

- `output` には truncate 後の本文だけを格納し、末尾の説明文を付けない。
- 新しく `truncation-notice` 出力を追加。truncate された場合のみ Markdown リンク付きの一文を入れる。

```javascript
const serverUrl = process.env.GITHUB_SERVER_URL;
const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;

let truncationNotice = '';
const maxLength = 30000;
if (output.length > maxLength) {
  output = output.substring(0, maxLength);
  truncationNotice = `> ⚠️ Output truncated. [View full logs](${runUrl}) for complete details.`;
}

core.setOutput('output', output);
core.setOutput('truncation-notice', truncationNotice);
```

`action.yaml` 側では `</details>` の **外** に `${{ steps.parse-results.outputs.truncation-notice }}` を配置する。これによりコードブロックを抜けてリンクがレンダリングされ、details が折りたたまれた状態でも警告とリンクが見える。

### Component Boundaries

| Component | Responsibility |
| --- | --- |
| `parse-results.js` | Terragrunt 実行結果の解釈・出力整形・truncation 判定。Workflow Run URL を組み立てて truncation notice として出力する。 |
| `action.yaml` (PR comment template) | コメント全体のレイアウト。`github` コンテキストからヘッダー用の Workflow Run リンクを生成する。`parse-results.js` から受け取った `truncation-notice` を `</details>` の外に展開する。 |

URL の組み立て箇所が 2 か所（JS と YAML）に分散するが、それぞれ「自分のスコープで必要な URL を自前で組み立てる」という責務分離を優先する。共通化のためのヘルパー導入は YAGNI として見送る。

## Output Schema Change

`parse-results.js` の `outputs` に `truncation-notice` を追加する。`action.yaml` の `outputs:` セクションには公開しない（PR コメントテンプレート内部でのみ使用）。

| Output | Existing | Type | Description |
| --- | --- | --- | --- |
| `status` | yes | string | `✅ Success` または `❌ Failed (exit code: N)` |
| `is-failed` | yes | string (`'true'`/`'false'`) | 実行失敗判定 |
| `output` | yes (changed) | string | Terragrunt の整形済み出力。truncate された場合は末尾の説明文を含めない |
| `truncation-notice` | new | string | truncate された場合のみ Markdown リンク付き警告文。それ以外は空文字列 |

## Error Handling

- `GITHUB_SERVER_URL` / `GITHUB_REPOSITORY` / `GITHUB_RUN_ID` は GitHub Actions 実行環境では常に設定されている前提とし、未定義チェックは行わない（YAGNI）。
- truncate されないケースでは `truncation-notice` は空文字列。`action.yaml` テンプレートに空文字列が展開されても余分な空行が増えるだけで害はない。

## Testing

実環境のワークフロー上で以下を確認する：

1. truncate されないケース（短い出力）：PR コメントヘッダーに `**Workflow Run**: [#NNN](URL)` が表示され、リンクをクリックして該当 Run に遷移できる。`</details>` の後ろに余分な警告は出ない。
2. truncate されるケース（30,000 文字超）：上記に加え、`</details>` の直後に `> ⚠️ Output truncated. [View full logs](URL) for complete details.` が表示され、リンクが正しい Run に遷移する。
3. PR への upsert（`comment-tag` による更新）が引き続き機能する。

ユニットテストは現状 `parse-results.js` に存在しない。本変更でテストハーネスを新設するスコープも持たないため、実環境での確認に留める。
