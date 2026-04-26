# panicboat-actions Rename and Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** panicboat-actions の 6 つの composite action のうち 3 つを `<対象>-<動詞>` 形にリネームし、3 つを削除して呼び元に直書き／ライブラリ直呼びに置換する。

**Architecture:** `@main` 参照を維持するため 3 段階（後ろに片付け工程あり）で実施する。Phase 1: panicboat-actions に新ディレクトリ追加（旧も残す）。Phase 2: monorepo の参照を新名称に切替＋削除分を直書き化。Phase 3: platform の参照を新名称に切替。Phase 4: panicboat-actions の旧ディレクトリ削除＋README 更新。

**Tech Stack:** GitHub Actions (composite), `nektos/act` v0.2.87 (ローカル syntax 検証), `gh` CLI (Draft PR 作成)。

**Spec reference:** `panicboat-actions/docs/superpowers/specs/2026-04-26-actions-rename-design.md`

**Cross-repo notes:**

- 各 Phase は別リポジトリで作業する。Phase 1 / 4 は `panicboat-actions`、Phase 2 は `monorepo`、Phase 3 は `platform`。
- Phase 1 は本ファイルが置かれている worktree（`panicboat-actions/.claude/worktrees/chore-rename-actions/`、ブランチ `chore/rename-actions`）で進行。
- Phase 2 / 3 / 4 は新たに worktree を作る（手順は各 Phase の冒頭タスク参照）。
- `act` 用の test workflow（`test--<name>.yaml`）は **絶対に commit しない**。各 Phase 冒頭で `.git/info/exclude` に `test--*.yaml` を追加する。

---

## Phase 1: Add new actions in panicboat-actions

This phase runs in the existing worktree at `panicboat-actions/.claude/worktrees/chore-rename-actions/` on branch `chore/rename-actions`.

### Task 1.0: Set up local act exclusion

**Files:**
- Modify: `.git/info/exclude`

- [ ] **Step 1: Append test workflow exclusion**

Worktree 内では `.git` がファイルなので、`git rev-parse --git-path` で実体パスを解決してから append する。

```bash
exclude=$(git rev-parse --git-path info/exclude)
echo "/.github/workflows/test--*.yaml" >> "$exclude"
```

- [ ] **Step 2: Verify entry is present**

```bash
tail -3 "$(git rev-parse --git-path info/exclude)"
```
Expected: 末尾に `/.github/workflows/test--*.yaml` が含まれる。

### Task 1.1: Create claude-run action

**Files:**
- Create: `claude-run/action.yaml`
- Create (uncommitted): `.github/workflows/test--claude-run.yaml`

- [ ] **Step 1: Create test workflow (uncommitted)**

Write `.github/workflows/test--claude-run.yaml`:

```yaml
name: 'Test: claude-run'

on:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6.0.2
      - name: Run claude-run
        uses: ./claude-run
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Run act, expect failure (claude-run does not exist yet)**

Run: `act -W .github/workflows/test--claude-run.yaml -j test --container-architecture linux/amd64 -n`
Expected: action.yaml not found のエラーで止まる。

- [ ] **Step 3: Create `claude-run/action.yaml`**

```yaml
---
name: Claude Run
description: Run Claude Code via AWS Bedrock

inputs:
  token:
    description: 'GitHub token for authentication'
    required: true
  aws-role-arn:
    description: 'AWS IAM role ARN for Bedrock access'
    required: false
    default: >-
      arn:aws:iam::559744160976:role/ai-assistant-develop-github-actions-role
  aws-region:
    description: 'AWS region'
    required: false
    default: 'us-west-2'
  trigger-phrase:
    description: 'Phrase to trigger Claude'
    required: false
    default: '@claude'
  model:
    description: 'Claude model to use'
    required: false
    default: 'global.anthropic.claude-sonnet-4-6'

runs:
  using: composite
  steps:
    - name: Authorize
      shell: bash
      run: |
        owner="${{ github.repository_owner }}"
        actor="${{ github.actor }}"
        if [ "$owner" != "$actor" ]; then
          echo "::error::$actor is not authorized to run Claude Code"
          exit 1
        fi

    - name: Checkout code
      uses: actions/checkout@v6.0.2
      with:
        token: ${{ inputs.token }}
        fetch-depth: 1

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v6.1.0
      with:
        role-to-assume: ${{ inputs.aws-role-arn }}
        aws-region: ${{ inputs.aws-region }}

    - name: Run Claude Code
      uses: anthropics/claude-code-action@v1.0.103
      with:
        github_token: ${{ inputs.token }}
        trigger_phrase: ${{ inputs.trigger-phrase }}
        claude_args: --model ${{ inputs.model }}
        use_bedrock: "true"
      env:
        ANTHROPIC_BEDROCK_BASE_URL: >-
          https://bedrock-runtime.${{ inputs.aws-region }}.amazonaws.com
        ANTHROPIC_MAX_RETRIES: "3"
        ANTHROPIC_TIMEOUT: "120"
        ANTHROPIC_REQUEST_DELAY: "5"
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: 8192
```

- [ ] **Step 4: Run act again, expect to reach AWS configure step**

Run: `act -W .github/workflows/test--claude-run.yaml -j test --container-architecture linux/amd64`
Expected: `Authorize` → `Checkout code` まで通り、`Configure AWS credentials` で OIDC token が取れず失敗する（act の制約）。それより前の step がすべて成功すれば合格。

- [ ] **Step 5: Verify only intended files are staged**

Run: `git status -s`
Expected: 以下 1 件のみ。`test--claude-run.yaml` は出ない。
```
?? claude-run/
```

- [ ] **Step 6: Commit**

```bash
git add claude-run/action.yaml
git commit -s -m "feat: add claude-run action (renamed from claude-code-action)"
```

### Task 1.2: Create kustomize-diff action

**Files:**
- Create: `kustomize-diff/action.yaml`
- Create (uncommitted): `.github/workflows/test--kustomize-diff.yaml`

- [ ] **Step 1: Create test workflow (uncommitted)**

Write `.github/workflows/test--kustomize-diff.yaml`:

```yaml
name: 'Test: kustomize-diff'

on:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run kustomize-diff (smoke)
        uses: ./kustomize-diff
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          service-name: example
          environment: develop
          path: nonexistent/overlays/develop
```

- [ ] **Step 2: Run act, expect failure (action does not exist yet)**

Run: `act -W .github/workflows/test--kustomize-diff.yaml -j test --container-architecture linux/amd64 -n`
Expected: action.yaml not found のエラーで止まる。

- [ ] **Step 3: Create `kustomize-diff/action.yaml`**

```yaml
name: 'Kustomize Diff'
description: 'Build kustomize overlays and post diff as a PR comment'

branding:
  icon: 'layers'
  color: 'blue'

inputs:
  token:
    description: 'GitHub token with required permissions'
    required: true
  service-name:
    description: 'Service name for identification'
    required: true
  environment:
    description: 'Environment name (develop, staging, production, etc.)'
    required: true
  path:
    description: 'Path to kustomize overlay directory'
    required: true
  pr-number:
    description: 'Pull request number for commenting'
    required: false

outputs:
  has-diff:
    description: 'Whether differences were found (true/false)'
    value: ${{ steps.diff.outputs.has-diff }}

runs:
  using: 'composite'
  steps:
    - name: Checkout base ref
      uses: actions/checkout@v6
      with:
        ref: ${{ github.event.pull_request.base.sha }}
        path: base
        token: ${{ inputs.token }}

    - name: Build head manifests
      id: kustomize-head
      uses: int128/kustomize-action@v1
      with:
        kustomization: ${{ inputs.path }}/kustomization.yaml
        write-individual-files: true

    - name: Build base manifests
      id: kustomize-base
      uses: int128/kustomize-action@v1
      with:
        base-directory: base
        kustomization: ${{ inputs.path }}/kustomization.yaml
        write-individual-files: true

    - name: Diff manifests
      id: diff
      uses: int128/diff-action@v2
      with:
        base: ${{ steps.kustomize-base.outputs.directory }}
        head: ${{ steps.kustomize-head.outputs.directory }}

    - name: Comment PR
      if: inputs.pr-number != ''
      uses: thollander/actions-comment-pull-request@v3.0.1
      with:
        message: |
          ## Kubernetes Diff

          **Service**: `${{ inputs.service-name }}`
          **Environment**: `${{ inputs.environment }}`

          ${{ steps.diff.outputs.comment-body || 'No changes' }}
        comment-tag: "kubernetes-${{ inputs.service-name }}-${{ inputs.environment }}"
        mode: upsert
        pr-number: ${{ inputs.pr-number }}
        GITHUB_TOKEN: ${{ inputs.token }}
        reactions: ${{ steps.diff.outputs.has-diff == 'true' && 'rocket' || '' }}
      continue-on-error: true
```

- [ ] **Step 4: Run act, expect to reach kustomize/diff steps**

Run: `act -W .github/workflows/test--kustomize-diff.yaml -j test --container-architecture linux/amd64`
Expected: `Checkout base ref` → `Build head manifests` まで進む。`Build head manifests` で kustomization.yaml が見つからずに止まるのは想定挙動。`action.yaml` のパースエラーや input 展開エラーが出ないこと。

- [ ] **Step 5: Verify only intended files are staged**

Run: `git status -s`
Expected: `?? kustomize-diff/` が含まれる。`test--kustomize-diff.yaml` は出ない。

- [ ] **Step 6: Commit**

```bash
git add kustomize-diff/action.yaml
git commit -s -m "feat: add kustomize-diff action (renamed from kubernetes)"
```

### Task 1.3: Create terragrunt-run action with helper scripts

**Files:**
- Create: `terragrunt-run/action.yaml`
- Create: `terragrunt-run/parse-results.js`
- Create: `terragrunt-run/validate-working-directory.js`
- Create: `terragrunt-run/verify-aws-credentials.js`
- Create (uncommitted): `.github/workflows/test--terragrunt-run.yaml`

- [ ] **Step 1: Create test workflow (uncommitted)**

Write `.github/workflows/test--terragrunt-run.yaml`:

```yaml
name: 'Test: terragrunt-run'

on:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6.0.2
      - name: Run terragrunt-run (smoke)
        uses: ./terragrunt-run
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          service-name: example
          environment: develop
          action-type: plan
          iam-role: arn:aws:iam::000000000000:role/dummy
          aws-region: ap-northeast-1
          working-directory: nonexistent
```

- [ ] **Step 2: Run act, expect failure (action does not exist yet)**

Run: `act -W .github/workflows/test--terragrunt-run.yaml -j test --container-architecture linux/amd64 -n`
Expected: action.yaml not found のエラーで止まる。

- [ ] **Step 3: Copy helper scripts**

```bash
cp terragrunt/parse-results.js terragrunt-run/parse-results.js
cp terragrunt/verify-aws-credentials.js terragrunt-run/verify-aws-credentials.js
```

- [ ] **Step 4: Create `terragrunt-run/validate-working-directory.js` without repository reference**

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async ({ core, inputs }) => {
  try {
    core.info('🔍 Validating working directory');

    const workingDirectory = inputs['working-directory'];
    const serviceName = inputs['service-name'];
    const environment = inputs['environment'];
    const actionType = inputs['action-type'];

    core.info(`Working Directory: ${workingDirectory}`);
    core.info(`Service: ${serviceName}`);
    core.info(`Environment: ${environment}`);
    core.info(`Action Type: ${actionType}`);

    // Check if working directory exists
    if (!fs.existsSync(workingDirectory)) {
      core.error(`Working directory '${workingDirectory}' does not exist`);
      core.error('This may indicate a configuration issue or the service structure has changed.');

      // Show available directories to help with debugging
      core.info('Available directories:');
      try {
        const output = execSync('find . -type d -name "*terragrunt*" -o -name "*' + serviceName + '*" | head -10',
          { encoding: 'utf8' });
        core.info(output);
      } catch (error) {
        core.warning(`Could not list directories: ${error.message}`);
      }

      core.setFailed(`Working directory '${workingDirectory}' does not exist`);
      return;
    }

    // Check for terragrunt.hcl file
    const terragruntHcl = path.join(workingDirectory, 'terragrunt.hcl');
    if (!fs.existsSync(terragruntHcl)) {
      core.warning(`No terragrunt.hcl found in ${workingDirectory}`);
      core.warning('This may be expected depending on the service structure.');
    }

    core.info(`✅ Working directory validated: ${workingDirectory}`);

  } catch (error) {
    core.setFailed(`Working directory validation failed: ${error.message}`);
    throw error;
  }
};
```

- [ ] **Step 5: Create `terragrunt-run/action.yaml`**

```yaml
name: 'Terragrunt Run'
description: 'Execute terragrunt plan or apply with AWS OIDC'

branding:
  icon: 'cloud'
  color: 'orange'

inputs:
  token:
    description: 'GitHub token with required permissions'
    required: true
  service-name:
    description: 'Service name for terragrunt execution'
    required: true
  environment:
    description: 'Environment name (develop, staging, production, etc.)'
    required: true
  action-type:
    description: 'Action type: plan or apply'
    required: true
  iam-role:
    description: 'IAM role for plan/apply operations'
    required: true
  aws-region:
    description: 'AWS region'
    required: true
  working-directory:
    description: 'Working directory for terragrunt execution'
    required: true
  pr-number:
    description: 'Pull request number for commenting'
    required: false

outputs:
  execution-status:
    description: 'Execution status (success/failure)'
    value: ${{ steps.parse-results.outputs.status }}
  execution-output:
    description: 'Execution output'
    value: ${{ steps.parse-results.outputs.output }}
  is-failed:
    description: 'Whether execution failed'
    value: ${{ steps.parse-results.outputs.is-failed }}

runs:
  using: 'composite'
  steps:
    - name: Checkout
      uses: actions/checkout@v6.0.2
      with:
        token: ${{ inputs.token }}

    - name: Validate working directory
      uses: actions/github-script@v9.0.0
      with:
        script: |
          const path = require('path');
          const validateWorkingDirectory = require(path.join(process.env.GITHUB_ACTION_PATH, 'validate-working-directory.js'));
          await validateWorkingDirectory({ core, inputs: ${{ toJSON(inputs) }} });

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v6.1.0
      with:
        role-to-assume: ${{ inputs.iam-role }}
        aws-region: ${{ inputs.aws-region }}
        role-session-name: GitHubActions-Terragrunt-${{ inputs.action-type }}-${{ inputs.environment }}
        audience: sts.amazonaws.com

    - name: Verify AWS credentials
      uses: actions/github-script@v9.0.0
      with:
        script: |
          const path = require('path');
          const verifyCredentials = require(path.join(process.env.GITHUB_ACTION_PATH, 'verify-aws-credentials.js'));
          await verifyCredentials({ core, inputs: ${{ toJSON(inputs) }} });

    - name: Execute Terragrunt
      id: terragrunt
      uses: gruntwork-io/terragrunt-action@v3.2.0
      with:
        tg_version: '1.0.2'
        tofu_version: '1.11.6'
        tg_dir: ${{ inputs.working-directory }}
        tg_command: ${{ inputs.action-type }}
        tg_add_approve: ${{ inputs.action-type == 'apply' && '1' || '' }}
        github_token: ${{ inputs.token }}
      env:
        TF_INPUT: false
        GITHUB_TOKEN: ${{ inputs.token }}
        AWS_DEFAULT_REGION: ${{ inputs.aws-region }}

    - name: Parse execution results
      if: always()
      id: parse-results
      uses: actions/github-script@v9.0.0
      with:
        script: |
          const path = require('path');
          const parseResults = require(path.join(process.env.GITHUB_ACTION_PATH, 'parse-results.js'));
          await parseResults({
            core,
            inputs: ${{ toJSON(inputs) }},
            steps: {
              terragrunt: {
                outputs: {
                  tg_action_exit_code: '${{ steps.terragrunt.outputs.tg_action_exit_code }}',
                  tg_action_output: `${{ steps.terragrunt.outputs.tg_action_output }}`
                }
              }
            }
          });

    - name: Comment PR with Terragrunt results
      if: always() && inputs.pr-number != ''
      uses: thollander/actions-comment-pull-request@v3.0.1
      with:
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
        comment-tag: "terragrunt-${{ inputs.service-name }}-${{ inputs.environment }}-${{ inputs.action-type }}"
        mode: upsert
        pr-number: ${{ inputs.pr-number }}
        GITHUB_TOKEN: ${{ inputs.token }}
        reactions: ${{ steps.parse-results.outputs.is-failed == 'true' && 'confused' || 'rocket' }}
      continue-on-error: true
```

- [ ] **Step 6: Run act, expect to reach validate-working-directory step**

Run: `act -W .github/workflows/test--terragrunt-run.yaml -j test --container-architecture linux/amd64`
Expected: `Checkout` → `Validate working directory` まで進み、`nonexistent` ディレクトリが無いことで失敗するのは想定挙動。`Configure AWS credentials` の手前まで `action.yaml` のパース・input 展開が壊れていないこと。

- [ ] **Step 7: Verify only intended files are staged**

Run: `git status -s`
Expected: `?? terragrunt-run/` のみ。`test--terragrunt-run.yaml` は出ない。

- [ ] **Step 8: Commit**

```bash
git add terragrunt-run/action.yaml terragrunt-run/parse-results.js terragrunt-run/validate-working-directory.js terragrunt-run/verify-aws-credentials.js
git commit -s -m "feat: add terragrunt-run action (renamed from terragrunt)"
```

### Task 1.4: Update self-referencing workflow to claude-run

**Files:**
- Modify: `.github/workflows/claude-code-action.yaml`

- [ ] **Step 1: Update reference**

Edit `.github/workflows/claude-code-action.yaml` の line 37 を `claude-code-action@main` から `claude-run@main` へ:

```yaml
      - name: Run Claude Code
        uses: panicboat/panicboat-actions/claude-run@main
        with:
          token: ${{ steps.app-token.outputs.token }}
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/claude-code-action.yaml`
Expected: 1 行のみ変更（`claude-code-action@main` → `claude-run@main`）。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-code-action.yaml
git commit -s -m "ci: switch self-reference to claude-run"
```

### Task 1.5: Push branch and create draft PR

- [ ] **Step 1: Push branch with tracking**

```bash
git push -u origin HEAD
```

Expected: `chore/rename-actions` が origin に push される。

- [ ] **Step 2: Create draft PR**

```bash
gh pr create --draft --title "Add new action directories: claude-run, kustomize-diff, terragrunt-run" --body "$(cat <<'EOF'
## Summary
- Add `claude-run/` (renamed from `claude-code-action/`)
- Add `kustomize-diff/` (renamed from `kubernetes/`)
- Add `terragrunt-run/` (renamed from `terragrunt/`)
- Old directories remain in place to keep `@main` references in monorepo / platform working until they switch over.
- Self-referencing workflow `.github/workflows/claude-code-action.yaml` already points to `claude-run@main`.

Spec: `docs/superpowers/specs/2026-04-26-actions-rename-design.md`
Plan: `docs/superpowers/plans/2026-04-26-actions-rename.md`

## Test plan
- [x] Local act run for each new action: action.yaml がパースされ、外部 API 呼び出し直前まで step が進むことを確認
- [ ] Merge → smoke test from monorepo / platform PRs in Phase 2 / 3
EOF
)"
```

- [ ] **Step 3: Wait for review and merge**

PR がレビュー & 通常マージされたら Phase 1 完了。`@main` には旧ディレクトリと新ディレクトリの両方が存在する状態になる。

---

## Phase 2: Switch references in monorepo

This phase runs in a fresh worktree of the monorepo. Phase 1 must be merged into `panicboat/panicboat-actions:main` before starting.

### Task 2.0: Set up monorepo worktree

**Files:**
- Modify: `monorepo/.git/info/exclude`

- [ ] **Step 1: Confirm Phase 1 is merged**

Run from anywhere:
```bash
gh api repos/panicboat/panicboat-actions/contents/claude-run --jq .name
```
Expected: `claude-run`（404 が返るなら Phase 1 が未マージ。マージ完了まで待つ）。

- [ ] **Step 2: Create worktree from origin/main**

```bash
cd /Users/takanokenichi/GitHub/panicboat/monorepo
git fetch origin --quiet
grep -F "/.claude/worktrees/" .git/info/exclude >/dev/null 2>&1 || echo "/.claude/worktrees/" >> .git/info/exclude
git worktree add -b chore/switch-panicboat-actions .claude/worktrees/chore-switch-panicboat-actions origin/main
cd .claude/worktrees/chore-switch-panicboat-actions
```

- [ ] **Step 3: Verify clean baseline**

Run: `git status -sb`
Expected: `## chore/switch-panicboat-actions...origin/main`、変更なし。

### Task 2.1: Replace auto-approve workflow with hmarr direct call

**Files:**
- Modify: `.github/workflows/auto-approve.yaml`

- [ ] **Step 1: Replace file content**

Write `.github/workflows/auto-approve.yaml`:

```yaml
name: Auto-approve PRs

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  auto-approve:
    runs-on: ubuntu-latest
    if: endsWith(github.actor, '[bot]')
    steps:
      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v3.1.1
        with:
          app-id: ${{ vars.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}

      - name: Auto-approve
        uses: hmarr/auto-approve-action@v4.0.0
        with:
          github-token: ${{ steps.app-token.outputs.token }}
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/auto-approve.yaml`
Expected: `panicboat-actions/auto-approve@main` の参照と `auto-merge-label` 行が消え、`hmarr/auto-approve-action@v4.0.0` の直接呼び出しに置き換わっている。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/auto-approve.yaml
git commit -s -m "ci: call hmarr/auto-approve-action directly and drop auto-merge"
```

### Task 2.2: Update claude-code-action.yaml reference

**Files:**
- Modify: `.github/workflows/claude-code-action.yaml`

- [ ] **Step 1: Edit reference line**

`.github/workflows/claude-code-action.yaml` の line 37 を変更:

```yaml
      - name: Run Claude Code
        uses: panicboat/panicboat-actions/claude-run@main
        with:
          token: ${{ steps.app-token.outputs.token }}
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/claude-code-action.yaml`
Expected: 1 行のみ変更（`claude-code-action@main` → `claude-run@main`）。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-code-action.yaml
git commit -s -m "ci: switch claude-code-action workflow to claude-run"
```

### Task 2.3: Update reusable--kubernetes-builder.yaml

**Files:**
- Modify: `.github/workflows/reusable--kubernetes-builder.yaml`

- [ ] **Step 1: Edit reference and input keys**

`.github/workflows/reusable--kubernetes-builder.yaml` の `Kubernetes Diff` step を以下に置換:

```yaml
      - name: Kustomize Diff
        uses: panicboat/panicboat-actions/kustomize-diff@main
        with:
          token: ${{ steps.app-token.outputs.token }}
          service-name: ${{ inputs.service-name }}
          environment: ${{ inputs.environment }}
          path: ${{ inputs.path }}
          pr-number: ${{ steps.pr-info.outputs.number }}
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/reusable--kubernetes-builder.yaml`
Expected: step 名が `Kubernetes Diff` → `Kustomize Diff`、`uses:` のパスが `kubernetes@main` → `kustomize-diff@main`、`github-token:` → `token:` の 3 点変更。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/reusable--kubernetes-builder.yaml
git commit -s -m "ci: switch reusable--kubernetes-builder to kustomize-diff"
```

### Task 2.4: Update reusable--terragrunt-executor.yaml

**Files:**
- Modify: `.github/workflows/reusable--terragrunt-executor.yaml`

- [ ] **Step 1: Edit reference, input keys, drop repository**

`.github/workflows/reusable--terragrunt-executor.yaml` の `Execute Terragrunt` step を以下に置換:

```yaml
      - name: Execute Terragrunt
        uses: panicboat/panicboat-actions/terragrunt-run@main
        with:
          token: ${{ steps.app-token.outputs.token }}
          service-name: ${{ inputs.service-name }}
          environment: ${{ inputs.environment }}
          action-type: ${{ inputs.action-type }}
          iam-role: ${{ inputs.iam-role }}
          aws-region: ${{ inputs.aws-region }}
          working-directory: ${{ inputs.working-directory }}
          pr-number: ${{ steps.pr-info.outputs.number }}
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/reusable--terragrunt-executor.yaml`
Expected: `terragrunt@main` → `terragrunt-run@main`、`github-token:` → `token:`、`repository: ${{ github.repository }}` の 1 行削除。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/reusable--terragrunt-executor.yaml
git commit -s -m "ci: switch reusable--terragrunt-executor to terragrunt-run"
```

### Task 2.5: Inline container-builder steps into reusable--container-builder.yaml

**Files:**
- Modify: `.github/workflows/reusable--container-builder.yaml`

- [ ] **Step 1: Replace file content**

Write `.github/workflows/reusable--container-builder.yaml`:

```yaml
name: Reusable Container Builder

on:
  workflow_call:
    inputs:
      image-name:
        required: true
        type: string
        description: 'Name of the image (e.g. service-name)'
      working-directory:
        required: true
        type: string
        description: 'Directory containing the Dockerfile'
      app-id:
        required: true
        type: string
        description: 'GitHub App ID for authentication'
    secrets:
      private-key:
        required: true
        description: 'GitHub App private key for authentication'

jobs:
  build-and-push:
    if: inputs.image-name != ''
    runs-on: ubuntu-24.04-arm
    permissions:
      contents: read
      packages: write

    steps:
      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v3.1.1
        with:
          app-id: ${{ inputs.app-id }}
          private-key: ${{ secrets.private-key }}
          owner: ${{ github.repository_owner }}

      - name: Checkout repository
        uses: actions/checkout@v6.0.2
        with:
          # Use GITHUB_TOKEN to ensure permission to create new packages
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Log in to the Container registry
        uses: docker/login-action@v4.1.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4.0.0

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v6.0.0
        with:
          images: ghcr.io/${{ github.repository }}/${{ inputs.image-name }}
          tags: |
            type=sha
            type=ref,event=pr
            type=raw,value=latest,enable={{is_default_branch}}
            type=raw,value=${{ github.actor }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v7.1.0
        with:
          platforms: linux/arm64
          context: ${{ inputs.working-directory }}
          file: ${{ inputs.working-directory }}/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/reusable--container-builder.yaml`
Expected: `panicboat-actions/container-builder@main` の参照が消え、checkout / login / buildx / metadata / build-push の step が直書きで現れる。tags-template の追加分（`type=raw,value=${{ github.actor }}`）が `metadata-action` の `tags:` に統合されている。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/reusable--container-builder.yaml
git commit -s -m "ci: inline container build steps and remove panicboat-actions/container-builder reference"
```

### Task 2.6: Inline container-cleaner steps into cleanup-container-image.yaml

**Files:**
- Modify: `.github/workflows/cleanup-container-image.yaml`

- [ ] **Step 1: Replace file content**

Write `.github/workflows/cleanup-container-image.yaml`:

```yaml
name: 'Cleanup Container Images'

on:
  schedule:
    # Run daily at 01:00 JST
    - cron: '0 16 * * *'
  workflow_dispatch: # Allow manual trigger

permissions:
  contents: read
  packages: write

jobs:
  cleanup-container:
    name: 'Cleanup ${{ matrix.service }}'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: ["handbooks", "monolith", "nyx"]
      fail-fast: false
    steps:
      # Step 1: Clean old PR tags (pr-*, older than retention days)
      - name: Clean old PR tags
        uses: dataaxiom/ghcr-cleanup-action@v1.0.16
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          package: ${{ github.event.repository.name }}/${{ matrix.service }}
          delete-tags: ^pr-
          older-than: 1 days
          exclude-tags: ^(latest|v\d+\.\d+\.\d+.*)$
          use-regex: true
          validate: true

      # Step 2: Clean all SHA tags (sha-*, regardless of age)
      - name: Clean SHA tags
        uses: dataaxiom/ghcr-cleanup-action@v1.0.16
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          package: ${{ github.event.repository.name }}/${{ matrix.service }}
          delete-tags: ^sha-
          exclude-tags: ^(latest|v\d+\.\d+\.\d+.*)$
          use-regex: true
          validate: true

      # Step 3: Clean all untagged images and orphaned images
      - name: Clean untagged images
        uses: dataaxiom/ghcr-cleanup-action@v1.0.16
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          package: ${{ github.event.repository.name }}/${{ matrix.service }}
          keep-n-untagged: 0
          delete-orphaned-images: true
          delete-ghost-images: true
          delete-partial-images: true
          exclude-tags: ^(latest|v\d+\.\d+\.\d+.*)$
          use-regex: true
          validate: true

  summary:
    name: 'Cleanup Summary'
    needs: cleanup-container
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Summary
        run: |
          echo "📊 Cleanup Summary"
          echo "Services: monorepo/handbooks, monorepo/monolith, monorepo/nyx"
          echo "Cleanup job status: ${{ needs.cleanup-container.result }}"
```

- [ ] **Step 2: Verify diff**

Run: `git diff .github/workflows/cleanup-container-image.yaml`
Expected: `panicboat-actions/container-cleaner@main` の参照が消え、`dataaxiom/ghcr-cleanup-action@v1.0.16` の 3 連続呼び出しが直書きされている。`pr-retention-days: 1` は `older-than: 1 days` にハードコード。`dry-run` input は除去（呼び元では渡していなかったため）。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/cleanup-container-image.yaml
git commit -s -m "ci: inline container cleanup steps and remove panicboat-actions/container-cleaner reference"
```

### Task 2.7: Clean up commented reference in auto-label--deploy-trigger.yaml

**Files:**
- Modify: `.github/workflows/auto-label--deploy-trigger.yaml`

- [ ] **Step 1: Inspect comment block (lines 115-132)**

Run: `sed -n '115,132p' .github/workflows/auto-label--deploy-trigger.yaml`
Expected: `cleanup-container` job のコメントアウトされた塊。`uses: panicboat/panicboat-actions/container-cleaner@main` を含む。

- [ ] **Step 2: Update commented `uses:` line (line 127)**

`.github/workflows/auto-label--deploy-trigger.yaml` の line 127 のコメント本文を更新:

```yaml
  #     - name: Cleanup container
  #       uses: dataaxiom/ghcr-cleanup-action@v1.0.16
  #       if: matrix.target.stack == 'docker'
  #       with:
  #         token: ${{ secrets.GITHUB_TOKEN }}
  #         package: monorepo/${{ matrix.target.service }}
  #         keep-n-untagged: 0
  #         use-regex: true
```

（コメント中身を直書きに揃える。コメントアウトされたままで可。）

- [ ] **Step 3: Verify diff**

Run: `git diff .github/workflows/auto-label--deploy-trigger.yaml`
Expected: コメント本文の更新のみ（active な job への影響なし）。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/auto-label--deploy-trigger.yaml
git commit -s -m "ci: update commented cleanup-container snippet to direct dataaxiom call"
```

### Task 2.8: Push and create draft PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Create draft PR**

```bash
gh pr create --draft --title "Switch panicboat-actions references to renamed actions" --body "$(cat <<'EOF'
## Summary
- `auto-approve.yaml`: call `hmarr/auto-approve-action@v4.0.0` directly, drop auto-merge.
- `claude-code-action.yaml`: switch reference to `panicboat-actions/claude-run@main`.
- `reusable--kubernetes-builder.yaml`: switch to `kustomize-diff@main`, rename `github-token` → `token`.
- `reusable--terragrunt-executor.yaml`: switch to `terragrunt-run@main`, rename `github-token` → `token`, drop `repository`.
- `reusable--container-builder.yaml`: inline build steps (no longer use `container-builder@main`).
- `cleanup-container-image.yaml`: inline cleanup steps (no longer use `container-cleaner@main`).
- `auto-label--deploy-trigger.yaml`: refresh the commented-out cleanup snippet.

Depends on: panicboat-actions PR (Phase 1) merged.

## Test plan
- [ ] Trigger a bot PR to verify `auto-approve.yaml` (approve only, no merge)
- [ ] Comment `@claude` on a PR/issue to verify `claude-code-action.yaml`
- [ ] Open a PR touching kubernetes overlays to verify `reusable--kubernetes-builder.yaml`
- [ ] Open a PR touching terragrunt configs to verify `reusable--terragrunt-executor.yaml`
- [ ] Open a PR touching a Dockerfile to verify `reusable--container-builder.yaml`
- [ ] Manually dispatch `cleanup-container-image.yaml` to verify cleanup steps
EOF
)"
```

- [ ] **Step 3: Smoke test on the draft PR**

Draft PR 上で実 GitHub Actions が走ることを確認する。各 reusable workflow が呼ばれる PR を別途作成して、build / diff / cleanup が成功することをチェック。失敗があれば修正コミットを積む。

- [ ] **Step 4: Mark ready and merge**

スモーク完了後、`gh pr ready` で Draft 解除 → 通常マージ。

---

## Phase 3: Switch references in platform

This phase runs in a fresh worktree of the platform repository. Phase 1 must be merged first. Phase 2 may proceed in parallel.

### Task 3.0: Set up platform worktree

- [ ] **Step 1: Confirm Phase 1 is merged**

Run:
```bash
gh api repos/panicboat/panicboat-actions/contents/claude-run --jq .name
```
Expected: `claude-run`

- [ ] **Step 2: Create worktree**

```bash
cd /Users/takanokenichi/GitHub/panicboat/platform
git fetch origin --quiet
grep -F "/.claude/worktrees/" .git/info/exclude >/dev/null 2>&1 || echo "/.claude/worktrees/" >> .git/info/exclude
git worktree add -b chore/switch-panicboat-actions .claude/worktrees/chore-switch-panicboat-actions origin/main
cd .claude/worktrees/chore-switch-panicboat-actions
```

### Task 3.1: Replace auto-approve workflow with hmarr direct call

**Files:**
- Modify: `.github/workflows/auto-approve.yaml`

- [ ] **Step 1: Replace file content**

Write `.github/workflows/auto-approve.yaml`:

```yaml
name: Auto-approve PRs

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  auto-approve:
    runs-on: ubuntu-latest
    if: endsWith(github.actor, '[bot]')
    steps:
      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v3.1.1
        with:
          app-id: ${{ vars.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}

      - name: Auto-approve
        uses: hmarr/auto-approve-action@v4.0.0
        with:
          github-token: ${{ steps.app-token.outputs.token }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/auto-approve.yaml
git commit -s -m "ci: call hmarr/auto-approve-action directly and drop auto-merge"
```

### Task 3.2: Update claude-code-action.yaml reference

**Files:**
- Modify: `.github/workflows/claude-code-action.yaml`

- [ ] **Step 1: Edit reference**

Line 37 を `claude-code-action@main` から `claude-run@main` に変更:

```yaml
      - name: Run Claude Code
        uses: panicboat/panicboat-actions/claude-run@main
        with:
          token: ${{ steps.app-token.outputs.token }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/claude-code-action.yaml
git commit -s -m "ci: switch claude-code-action workflow to claude-run"
```

### Task 3.3: Update reusable--kubernetes-builder.yaml

**Files:**
- Modify: `.github/workflows/reusable--kubernetes-builder.yaml`

- [ ] **Step 1: Edit reference and input keys**

`Kubernetes Diff` step を以下に置換:

```yaml
      - name: Kustomize Diff
        uses: panicboat/panicboat-actions/kustomize-diff@main
        with:
          token: ${{ steps.app-token.outputs.token }}
          service-name: ${{ inputs.service-name }}
          environment: ${{ inputs.environment }}
          path: kubernetes/manifests/${{ inputs.environment }}/${{ inputs.service-name }}
          pr-number: ${{ steps.pr-info.outputs.number }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/reusable--kubernetes-builder.yaml
git commit -s -m "ci: switch reusable--kubernetes-builder to kustomize-diff"
```

### Task 3.4: Update reusable--terragrunt-executor.yaml

**Files:**
- Modify: `.github/workflows/reusable--terragrunt-executor.yaml`

- [ ] **Step 1: Edit reference, input keys, drop repository**

`Execute Terragrunt` step を以下に置換:

```yaml
      - name: Execute Terragrunt
        uses: panicboat/panicboat-actions/terragrunt-run@main
        with:
          token: ${{ steps.app-token.outputs.token }}
          service-name: ${{ inputs.service-name }}
          environment: ${{ inputs.environment }}
          action-type: ${{ inputs.action-type }}
          iam-role: ${{ inputs.iam-role }}
          aws-region: ${{ inputs.aws-region }}
          working-directory: ${{ inputs.working-directory }}
          pr-number: ${{ steps.pr-info.outputs.number }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/reusable--terragrunt-executor.yaml
git commit -s -m "ci: switch reusable--terragrunt-executor to terragrunt-run"
```

### Task 3.5: Push and create draft PR

- [ ] **Step 1: Push**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Create draft PR**

```bash
gh pr create --draft --title "Switch panicboat-actions references to renamed actions" --body "$(cat <<'EOF'
## Summary
- `auto-approve.yaml`: call `hmarr/auto-approve-action@v4.0.0` directly, drop auto-merge.
- `claude-code-action.yaml`: switch reference to `panicboat-actions/claude-run@main`.
- `reusable--kubernetes-builder.yaml`: switch to `kustomize-diff@main`, rename `github-token` → `token`.
- `reusable--terragrunt-executor.yaml`: switch to `terragrunt-run@main`, rename `github-token` → `token`, drop `repository`.

Depends on: panicboat-actions PR (Phase 1) merged.

## Test plan
- [ ] Trigger a bot PR to verify `auto-approve.yaml` (approve only, no merge)
- [ ] Comment `@claude` on a PR/issue to verify `claude-code-action.yaml`
- [ ] Open a PR touching kubernetes overlays to verify `reusable--kubernetes-builder.yaml`
- [ ] Open a PR touching terragrunt configs to verify `reusable--terragrunt-executor.yaml`
EOF
)"
```

- [ ] **Step 3: Smoke test and merge**

Phase 2 と同じく実 GitHub Actions 上で各 workflow を回し、成功を確認したら Draft 解除 → マージ。

---

## Phase 4: Remove old actions in panicboat-actions

This phase runs in a fresh worktree of panicboat-actions. **Phase 2 AND Phase 3 must both be merged and stable** before starting (otherwise downstream `@main` references break).

### Task 4.0: Set up panicboat-actions cleanup worktree

- [ ] **Step 1: Confirm both Phase 2 and Phase 3 are merged**

Run:
```bash
gh api repos/panicboat/monorepo/contents/.github/workflows/auto-approve.yaml --jq .sha
gh api repos/panicboat/platform/contents/.github/workflows/auto-approve.yaml --jq .sha
```

両方の `auto-approve.yaml` が `panicboat-actions/auto-approve@main` を含まないことを以下で確認:

```bash
gh api repos/panicboat/monorepo/contents/.github/workflows/auto-approve.yaml --jq .content | base64 -d | grep panicboat-actions/auto-approve && echo "STILL_REFS" || echo "OK"
gh api repos/panicboat/platform/contents/.github/workflows/auto-approve.yaml --jq .content | base64 -d | grep panicboat-actions/auto-approve && echo "STILL_REFS" || echo "OK"
```

Expected: 両方 `OK`。

- [ ] **Step 2: Create worktree**

```bash
cd /Users/takanokenichi/GitHub/panicboat/panicboat-actions
git fetch origin --quiet
git worktree add -b chore/remove-old-actions .claude/worktrees/chore-remove-old-actions origin/main
cd .claude/worktrees/chore-remove-old-actions
```

### Task 4.1: Delete old action directories

**Files:**
- Delete: `auto-approve/`
- Delete: `claude-code-action/`
- Delete: `container-builder/`
- Delete: `container-cleaner/`
- Delete: `kubernetes/`
- Delete: `terragrunt/`

- [ ] **Step 1: Remove all six directories**

```bash
git rm -r auto-approve claude-code-action container-builder container-cleaner kubernetes terragrunt
```

- [ ] **Step 2: Verify removals**

Run: `git status -s`
Expected: 6 ディレクトリ配下のファイル群が `D` (deleted) で表示される。残るのは `claude-run/`, `kustomize-diff/`, `terragrunt-run/`, `README.md`, `README-ja.md`, `.github/`, `docs/`。

- [ ] **Step 3: Commit**

```bash
git commit -s -m "chore: remove old action directories now that all consumers reference new names"
```

### Task 4.2: Update README.md and README-ja.md

**Files:**
- Modify: `README.md`
- Modify: `README-ja.md`

- [ ] **Step 1: Update `README.md`**

Write `README.md`:

```markdown
# panicboat-actions

**English** | [🇯🇵 日本語](README-ja.md)

Personal-use GitHub Actions composite wrappers for panicboat infrastructure.

## Overview

This repository hosts composite actions tailored to the maintainer's environments. Anyone is free to read or fork them, but the wrappers embed assumptions specific to panicboat's AWS account, IAM roles, and deployment conventions, so they are not designed for general consumption.

## Available actions

- `claude-run/` — Run Claude Code via AWS Bedrock for repository automation.
- `kustomize-diff/` — Build kustomize overlays and post diff as a PR comment.
- `terragrunt-run/` — Execute Terragrunt plan or apply with AWS OIDC.

## Related

- [panicboat/deploy-actions](https://github.com/panicboat/deploy-actions) — Generic deployment orchestration (label-dispatcher, label-resolver, config-manager) reused as upstream.
```

- [ ] **Step 2: Update `README-ja.md`**

Write `README-ja.md`:

```markdown
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
```

- [ ] **Step 3: Verify diff**

Run: `git diff README.md README-ja.md`
Expected: 削除した 3 アクションへの参照行が消え、新名称の説明に差し替わる。

- [ ] **Step 4: Commit**

```bash
git add README.md README-ja.md
git commit -s -m "docs: update README to list only the renamed actions"
```

### Task 4.3: Push and create draft PR

- [ ] **Step 1: Push**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Create draft PR**

```bash
gh pr create --draft --title "Remove old action directories and update README" --body "$(cat <<'EOF'
## Summary
- Delete `auto-approve/`, `claude-code-action/`, `container-builder/`, `container-cleaner/`, `kubernetes/`, `terragrunt/`.
- Update `README.md` and `README-ja.md` to describe only the three remaining actions: `claude-run/`, `kustomize-diff/`, `terragrunt-run/`.

Depends on:
- monorepo PR (Phase 2) merged
- platform PR (Phase 3) merged

## Test plan
- [x] Verified that no remaining `@main` reference exists in monorepo or platform workflows
- [ ] Re-run a representative monorepo CI to confirm renamed-action references still work after old directories are gone
EOF
)"
```

- [ ] **Step 3: Mark ready and merge**

監査が済んだら Draft 解除 → マージ。これで panicboat-actions のリネーム作業が完了する。

---

## Cleanup after all phases

各 worktree は作業完了後に削除する:

```bash
# panicboat-actions Phase 1 worktree
cd /Users/takanokenichi/GitHub/panicboat/panicboat-actions
git worktree remove .claude/worktrees/chore-rename-actions

# monorepo Phase 2 worktree
cd /Users/takanokenichi/GitHub/panicboat/monorepo
git worktree remove .claude/worktrees/chore-switch-panicboat-actions

# platform Phase 3 worktree
cd /Users/takanokenichi/GitHub/panicboat/platform
git worktree remove .claude/worktrees/chore-switch-panicboat-actions

# panicboat-actions Phase 4 worktree
cd /Users/takanokenichi/GitHub/panicboat/panicboat-actions
git worktree remove .claude/worktrees/chore-remove-old-actions

# 全リポジトリで残骸を整理
git -C /Users/takanokenichi/GitHub/panicboat/panicboat-actions worktree prune
git -C /Users/takanokenichi/GitHub/panicboat/monorepo worktree prune
git -C /Users/takanokenichi/GitHub/panicboat/platform worktree prune
```
