# terragrunt-run Actions Log Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** terragrunt-run の PR コメントから GitHub Actions ログへ 1 クリックで遷移できる導線を追加する。truncate 時にも導線が機能するよう、警告文をコードブロックの外で Markdown リンクとして表示する。

**Architecture:** `parse-results.js` に `truncation-notice` 出力を追加し、truncate 時のみリンク付き警告文を生成する。`action.yaml` の PR コメントテンプレートはヘッダーに常設の Workflow Run リンクを追加し、`</details>` の外に `truncation-notice` を展開する。

**Tech Stack:** Node.js (GitHub Actions composite action `actions/github-script@v9`)、YAML (GitHub Actions workflow)、Node.js builtin test runner (`node:test` / `node:assert`)。外部テストランナーや `package.json` は導入しない。

**Spec:** [docs/superpowers/specs/2026-05-01-terragrunt-run-actions-log-link-design.md](../specs/2026-05-01-terragrunt-run-actions-log-link-design.md)

---

## File Structure

| File | Operation | Responsibility |
| --- | --- | --- |
| `terragrunt-run/parse-results.test.js` | Create | `parse-results.js` の truncation 動作に対するユニットテスト。Node.js builtin test runner を使用。 |
| `terragrunt-run/parse-results.js` | Modify | `truncation-notice` 出力を追加。truncate 時に `output` 末尾への append をやめ、代わりに `truncation-notice` へリンク付き警告文を格納する。 |
| `terragrunt-run/action.yaml` | Modify | PR コメントヘッダーに `**Workflow Run**: [#NNN](URL)` 行を追加。`</details>` の外に `${{ steps.parse-results.outputs.truncation-notice }}` を配置。 |

---

## Task 1: Add unit tests for non-truncate path

**Files:**
- Create: `terragrunt-run/parse-results.test.js`

このタスクでは `parse-results.js` を呼び出すテストインフラを構築し、まず **truncate されないケース** で `truncation-notice` が空文字列になることを確認するテストを書く。テスト先行 (Red) → 実装 (Green) のリズムで進める。

`parse-results.js` は `module.exports = async ({ core, inputs, steps }) => { ... }` という形でエクスポートされており、`core` を含む依存はすべて引数注入される。これによりモックは単純なオブジェクト差し替えで済む。

- [ ] **Step 1.1: Create the test file with the failing test**

Create `terragrunt-run/parse-results.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const parseResults = require('./parse-results.js');

function makeCore() {
  const outputs = {};
  return {
    outputs,
    setOutput(name, value) {
      outputs[name] = String(value);
    },
    info() {},
    setFailed(message) {
      this.failed = message;
    },
  };
}

function makeArgs(overrides = {}) {
  return {
    inputs: {
      'action-type': 'plan',
      'service-name': 'test-service',
      'environment': 'develop',
      ...(overrides.inputs ?? {}),
    },
    steps: {
      terragrunt: {
        outputs: {
          tg_action_exit_code: '0',
          tg_action_output: 'Sample terragrunt output',
          ...(overrides.stepOutputs ?? {}),
        },
      },
    },
  };
}

test.beforeEach(() => {
  process.env.GITHUB_SERVER_URL = 'https://github.com';
  process.env.GITHUB_REPOSITORY = 'panicboat/panicboat-actions';
  process.env.GITHUB_RUN_ID = '12345';
});

test('truncation-notice is empty string when output fits within limit', async () => {
  const core = makeCore();
  await parseResults({ core, ...makeArgs() });
  assert.equal(core.outputs['truncation-notice'], '');
});
```

- [ ] **Step 1.2: Run the test and confirm it fails**

Run from the worktree root:

```bash
node --test terragrunt-run/parse-results.test.js
```

Expected: 1 test fails with a message indicating `core.outputs['truncation-notice']` is `undefined` (current `parse-results.js` does not call `setOutput('truncation-notice', ...)`).

- [ ] **Step 1.3: Implement minimal change to pass the test**

Modify `terragrunt-run/parse-results.js`. Find the existing `// Set outputs` block (around line 65-68):

```javascript
    // Set outputs
    core.setOutput('status', status);
    core.setOutput('is-failed', isFailed.toString());
    core.setOutput('output', output);
```

Add a new `setOutput` call for `truncation-notice`, defaulting to empty string. Also add a `let truncationNotice = '';` declaration near the top of the `try` block. Final shape of the relevant section:

```javascript
    // Determine status and failure state
    const isSuccess = exitCode === '0';
    const status = isSuccess ? '✅ Success' : `❌ Failed (exit code: ${exitCode})`;
    const isFailed = !isSuccess;

    let truncationNotice = '';

    // Process output following terragrunt-action's approach
    let output;
    if (!rawOutput || rawOutput.trim() === '') {
      output = `${actionType} execution completed. See workflow logs for detailed output.`;
    } else {
      // Clean the output using terragrunt-action's approach
      output = cleanMultilineText(rawOutput);

      // Truncate if too long (GitHub comment limit consideration)
      const maxLength = 30000;
      if (output.length > maxLength) {
        output = output.substring(0, maxLength) + '\n... (output truncated, see workflow logs for full details)';
      }
    }

    // Set outputs
    core.setOutput('status', status);
    core.setOutput('is-failed', isFailed.toString());
    core.setOutput('output', output);
    core.setOutput('truncation-notice', truncationNotice);
```

Note: At this stage we are only adding the `truncation-notice` setOutput with the default empty value. The truncate path still uses the old behavior — that will change in Task 2.

- [ ] **Step 1.4: Run the test and confirm it passes**

```bash
node --test terragrunt-run/parse-results.test.js
```

Expected: 1 passing test, 0 failures.

- [ ] **Step 1.5: Commit**

```bash
git add terragrunt-run/parse-results.test.js terragrunt-run/parse-results.js
git commit -s -m "test: add parse-results test scaffold and truncation-notice baseline

非 truncate 経路で truncation-notice 出力が空文字列となることを保証する。
parse-results.js には truncation-notice の setOutput を追加（デフォルト空）。"
```

---

## Task 2: Implement truncation-notice with workflow run link

**Files:**
- Modify: `terragrunt-run/parse-results.test.js`
- Modify: `terragrunt-run/parse-results.js`

このタスクで本機能の中核を実装する。truncate されたとき `output` 末尾の説明文を消し、その代わり `truncation-notice` に Markdown リンク付き警告文を出力する。

- [ ] **Step 2.1: Add failing tests for the truncate path**

Append to `terragrunt-run/parse-results.test.js`:

```javascript
test('truncation-notice contains workflow run link when output exceeds limit', async () => {
  const core = makeCore();
  const longOutput = 'x'.repeat(30001);
  await parseResults({
    core,
    ...makeArgs({ stepOutputs: { tg_action_output: longOutput } }),
  });
  assert.equal(
    core.outputs['truncation-notice'],
    '> ⚠️ Output truncated. [View full logs](https://github.com/panicboat/panicboat-actions/actions/runs/12345) for complete details.',
  );
});

test('output is truncated to maxLength and contains no trailing notice when over limit', async () => {
  const core = makeCore();
  const longOutput = 'x'.repeat(30001);
  await parseResults({
    core,
    ...makeArgs({ stepOutputs: { tg_action_output: longOutput } }),
  });
  assert.equal(core.outputs['output'].length, 30000);
  assert.ok(!core.outputs['output'].includes('output truncated'));
  assert.ok(!core.outputs['output'].includes('see workflow logs'));
});
```

- [ ] **Step 2.2: Run tests and confirm they fail**

```bash
node --test terragrunt-run/parse-results.test.js
```

Expected: 2 failing tests (both new), 1 passing (from Task 1).

- The truncation-notice assertion fails because the current code still leaves it as `''`.
- The output-length assertion fails because the current code appends `\n... (output truncated, ...)` (about 50 chars), making `output.length` over 30000.

- [ ] **Step 2.3: Implement the truncation logic change**

Modify the `if (output.length > maxLength)` block in `terragrunt-run/parse-results.js`. Replace the existing block:

```javascript
      // Truncate if too long (GitHub comment limit consideration)
      const maxLength = 30000;
      if (output.length > maxLength) {
        output = output.substring(0, maxLength) + '\n... (output truncated, see workflow logs for full details)';
      }
```

with:

```javascript
      // Truncate if too long (GitHub comment limit consideration)
      const maxLength = 30000;
      if (output.length > maxLength) {
        output = output.substring(0, maxLength);
        const serverUrl = process.env.GITHUB_SERVER_URL;
        const repository = process.env.GITHUB_REPOSITORY;
        const runId = process.env.GITHUB_RUN_ID;
        const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
        truncationNotice = `> ⚠️ Output truncated. [View full logs](${runUrl}) for complete details.`;
      }
```

- [ ] **Step 2.4: Run tests and confirm all pass**

```bash
node --test terragrunt-run/parse-results.test.js
```

Expected: 3 passing tests, 0 failures.

- [ ] **Step 2.5: Syntax-check the modified JS file**

```bash
node --check terragrunt-run/parse-results.js
```

Expected: no output (success).

- [ ] **Step 2.6: Commit**

```bash
git add terragrunt-run/parse-results.test.js terragrunt-run/parse-results.js
git commit -s -m "feat: emit truncation-notice with workflow run link from parse-results

truncate 発生時に output 末尾の説明文をやめ、代わりに truncation-notice
出力へ Markdown リンク付き警告文を格納する。Markdown リンクをコードブロック
の外で展開可能にし、ユーザーが 1 クリックで Workflow Run に遷移できる。"
```

---

## Task 3: Update action.yaml for header link and notice placement

**Files:**
- Modify: `terragrunt-run/action.yaml`

PR コメントテンプレートを更新し、ヘッダーに常設の Workflow Run リンクを置く。`</details>` の **外** に `truncation-notice` を展開し、details が折りたたまれた状態でも警告とリンクが見えるようにする。

- [ ] **Step 3.1: Update the PR comment template**

Find this block in `terragrunt-run/action.yaml` (around lines 117-130):

```yaml
        message: |
          ## 🏗️ Terragrunt ${{ inputs.action-type }} Results

          **Service**: `${{ inputs.service-name }}`
          **Environment**: `${{ inputs.environment }}`
          **Status**: ${{ steps.parse-results.outputs.status }}

          <details>
          <summary>📋 Terragrunt Output</summary>

          ```hcl
          ${{ steps.parse-results.outputs.output }}
          ```
          </details>
```

Replace with:

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

Two changes:
1. New `**Workflow Run**: ...` line inserted after the `**Status**` line.
2. New line `${{ steps.parse-results.outputs.truncation-notice }}` inserted after `</details>` (still within the `message: |` literal block).

Indentation must stay at 10 spaces from column 1 (same as the existing message body). Do not modify the `comment-tag`, `mode`, `pr-number`, `GITHUB_TOKEN`, or `reactions` fields below.

- [ ] **Step 3.2: Validate YAML parses correctly**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('terragrunt-run/action.yaml')); print('OK')"
```

Expected: `OK`. If the command fails, the YAML structure was broken — re-check indentation around the modified `message:` block.

- [ ] **Step 3.3: Commit**

```bash
git add terragrunt-run/action.yaml
git commit -s -m "feat: surface workflow run link in terragrunt-run PR comment

PR コメントヘッダーに Workflow Run リンクを常設し、truncate 時には
details ブロックの外側に Markdown リンク付き警告文を展開する。"
```

---

## Task 4: End-to-end verification

ユニットテストは parse-results.js の振る舞いを担保するが、`action.yaml` の Markdown レンダリングや `${{ github.* }}` コンテキスト展開は実環境でしか確認できない。本タスクでは PR を作って実ワークフロー上で確認する。

- [ ] **Step 4.1: Push the branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 4.2: Create a Draft PR**

```bash
gh pr create --draft --title "feat(terragrunt-run): add workflow run link to PR comments" --body "$(cat <<'EOF'
## Summary
- terragrunt-run の PR コメントヘッダーに Workflow Run リンクを常設
- truncate 時には details ブロックの外側に Markdown リンク付き警告文を展開
- parse-results.js に Node.js builtin test runner を使ったユニットテストを追加

## Spec
- [docs/superpowers/specs/2026-05-01-terragrunt-run-actions-log-link-design.md](docs/superpowers/specs/2026-05-01-terragrunt-run-actions-log-link-design.md)

## Plan
- [docs/superpowers/plans/2026-05-01-terragrunt-run-actions-log-link.md](docs/superpowers/plans/2026-05-01-terragrunt-run-actions-log-link.md)

## Test plan
- [ ] terragrunt-run を呼ぶ実ワークフローで非 truncate ケースのコメント表示を確認
- [ ] terragrunt-run を呼ぶ実ワークフローで truncate ケース（30,000 文字超）のコメント表示を確認
- [ ] PR コメントの upsert（comment-tag による更新）が壊れていないことを確認
EOF
)"
```

- [ ] **Step 4.3: Verify in real workflow (non-truncate case)**

terragrunt-run を呼ぶリポジトリで小規模な terragrunt plan を実行し、PR コメントを確認する。

Expected:
- ヘッダーに `**Workflow Run**: [#NNN](https://github.com/.../actions/runs/NNN)` が表示され、リンクをクリックして該当 Run に遷移できる。
- `</details>` の後ろには余分な警告は表示されない（`truncation-notice` は空文字列）。

- [ ] **Step 4.4: Verify in real workflow (truncate case)**

30,000 文字を超える出力を生成する terragrunt plan で確認する（大規模な state や多数のリソースを含む環境を選ぶ）。

Expected:
- ヘッダーリンクは Step 4.3 と同じ。
- details の中身（`output`）は 30,000 文字でぴったり切り詰められ、末尾に `(output truncated, ...)` の文字列は **無い**。
- `</details>` の **直後** に以下のリンク付き警告が表示される:
  ```
  > ⚠️ Output truncated. [View full logs](https://github.com/.../actions/runs/NNN) for complete details.
  ```
- 警告内のリンクをクリックすると正しい Workflow Run に遷移する。

- [ ] **Step 4.5: Verify upsert behavior**

同じ PR で terragrunt-run を 2 回実行（コミットを追加するなど）し、PR コメントが新規作成ではなく更新されることを確認する。

Expected: `comment-tag` (`terragrunt-${service}-${env}-${action}`) が一致する 1 件のコメントが更新され、コメントが重複しない。

- [ ] **Step 4.6: Mark PR ready for review**

```bash
gh pr ready
```

---

## Self-Review Checklist

実装完了後、以下を確認する：

- [ ] `node --test terragrunt-run/parse-results.test.js` が 3 件すべて PASS する。
- [ ] `node --check terragrunt-run/parse-results.js` がエラーを出さない。
- [ ] `python3 -c "import yaml; yaml.safe_load(open('terragrunt-run/action.yaml'))"` が成功する。
- [ ] spec の Goals 3 項目（truncate 時 1 クリック / 常設導線 / 既存フォーマット維持）すべてに対応する変更が含まれている。
- [ ] `kustomize-diff` および `claude-run` のファイルは変更されていない (`git diff --name-only origin/main` で確認)。
