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
