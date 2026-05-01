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
