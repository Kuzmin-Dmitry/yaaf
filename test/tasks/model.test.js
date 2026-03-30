/**
 * Tests for task model validation
 */

const assert = require('assert');
const { validateTaskObject, TASK_STATES, TITLE_MAX_LENGTH, RESULT_TYPES } = require('../../lib/tasks/model');

function testValidTask() {
  console.log('Test: valid task passes validation');
  const result = validateTaskObject({ title: 'Fix login bug', description: '', state: 'Draft' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.reason, undefined);
}

function testMissingTitle() {
  console.log('Test: missing title fails validation');
  const result = validateTaskObject({ title: '', description: '', state: 'Draft' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('Title'));
}

function testNullTitle() {
  console.log('Test: null title fails validation');
  const result = validateTaskObject({ title: null, description: '', state: 'Draft' });
  assert.strictEqual(result.valid, false);
}

function testTitleTooLong() {
  console.log('Test: title exceeding max length fails validation');
  const longTitle = 'a'.repeat(TITLE_MAX_LENGTH + 1);
  const result = validateTaskObject({ title: longTitle, description: '', state: 'Draft' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('200'));
}

function testTitleAtMaxLength() {
  console.log('Test: title at exactly max length passes');
  const title = 'a'.repeat(TITLE_MAX_LENGTH);
  const result = validateTaskObject({ title, description: '', state: 'Draft' });
  assert.strictEqual(result.valid, true);
}

function testInvalidState() {
  console.log('Test: invalid state fails validation');
  const result = validateTaskObject({ title: 'Test', description: '', state: 'Invalid' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('Invalid'));
}

function testAllStatesValid() {
  console.log('Test: all defined states pass validation');
  for (const state of TASK_STATES) {
    const result = validateTaskObject({ title: 'Test', description: '', state });
    assert.strictEqual(result.valid, true, `State ${state} should be valid`);
  }
}

function testResultTypes() {
  console.log('Test: result types are defined');
  assert.strictEqual(RESULT_TYPES.Ready, 'Ready');
  assert.strictEqual(RESULT_TYPES.NeedInfo, 'NeedInfo');
  assert.strictEqual(RESULT_TYPES.NeedDecision, 'NeedDecision');
  assert.strictEqual(RESULT_TYPES.Rejected, 'Rejected');
}

console.log('=== Task Model Tests ===');
testValidTask();
testMissingTitle();
testNullTitle();
testTitleTooLong();
testTitleAtMaxLength();
testInvalidState();
testAllStatesValid();
testResultTypes();
console.log('All model tests passed.');
