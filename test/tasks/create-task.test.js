/**
 * Tests for shared validation steps used by create-github-issue pipeline.
 *
 * Tests merge() and validate() from ct-validate.js — shared step functions
 * used by cgi-dedup.js in the Lobster pipeline.
 */

const assert = require('assert');
const { merge, validate } = require('../../lobster/lib/tasks/cli/ct-validate');

// ============================
// Unit: merge (shared step)
// ============================

function testMergeBasic() {
  console.log('Test: merge — title and description override partial_state');
  const result = merge('New title', 'New desc', { title: 'Old', description: 'Old' });
  assert.strictEqual(result.title, 'New title');
  assert.strictEqual(result.description, 'New desc');
}

function testMergePreservesPartialState() {
  console.log('Test: merge — empty strings do not override partial_state');
  const result = merge('', '', { title: 'Keep', description: 'Keep', dedup_decision: 'create_new' });
  assert.strictEqual(result.title, 'Keep');
  assert.strictEqual(result.description, 'Keep');
  assert.strictEqual(result.dedup_decision, 'create_new');
}

function testMergeNullPartialState() {
  console.log('Test: merge — null partial_state starts fresh');
  const result = merge('Title', 'Desc', null);
  assert.strictEqual(result.title, 'Title');
  assert.strictEqual(result.description, 'Desc');
}

// ============================
// Unit: validate (shared step)
// ============================

function testValidateHappyPath() {
  console.log('Test: validate — happy path returns task');
  const result = validate({ title: 'Fix bug', description: 'Details' }, { recentTasks: [] });
  assert.ok(result.task);
  assert.strictEqual(result.task.title, 'Fix bug');
  assert.strictEqual(result.task.state, 'Draft');
}

function testValidateMissingTitle() {
  console.log('Test: validate — missing title returns NeedInfo');
  const result = validate({}, { recentTasks: [] });
  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['title']);
}

function testValidateDuplicate() {
  console.log('Test: validate — duplicate returns NeedDecision');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix bug', state: 'Draft' }] };
  const result = validate({ title: 'Fix bug' }, context);
  assert.strictEqual(result.type, 'NeedDecision');
  assert.strictEqual(result.candidates[0].id, 'TASK-42');
}

function testValidateDedupSkippedWithDecision() {
  console.log('Test: validate — dedup skipped with dedup_decision');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix bug', state: 'Draft' }] };
  const result = validate({ title: 'Fix bug', dedup_decision: 'create_new' }, context);
  assert.ok(result.task);
}

function testValidateTitleTooLong() {
  console.log('Test: validate — title too long returns Rejected');
  const result = validate({ title: 'a'.repeat(201) }, { recentTasks: [] });
  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'schema_violation');
}

// ============================
// Integration: merge → validate
// ============================

function testMergeValidateHappyPath() {
  console.log('Test: merge → validate happy path');
  const context = { recentTasks: [] };
  const parsed = merge('Fix login bug', 'Login returns 500', null);
  const result = validate(parsed, context);
  assert.ok(result.task);
  assert.strictEqual(result.task.title, 'Fix login bug');
}

function testMergeValidateNeedInfo() {
  console.log('Test: merge → validate NeedInfo');
  const parsed = merge('', '', null);
  const result = validate(parsed, { recentTasks: [] });
  assert.strictEqual(result.type, 'NeedInfo');
}

function testMergeValidateDedupFlow() {
  console.log('Test: merge → validate dedup → NeedDecision → create_new');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix bug', state: 'Draft' }] };

  // First call: duplicate found
  const parsed1 = merge('Fix bug', '', null);
  const result1 = validate(parsed1, context);
  assert.strictEqual(result1.type, 'NeedDecision');

  // Second call: user chose create_new
  const parsed2 = merge('Fix bug', '', { title: 'Fix bug', dedup_decision: 'create_new' });
  const result2 = validate(parsed2, context);
  assert.ok(result2.task);
}

// Run all
console.log('=== Create Task Pipeline Tests ===');
(async () => {
  // Unit: merge
  testMergeBasic();
  testMergePreservesPartialState();
  testMergeNullPartialState();

  // Unit: validate
  testValidateHappyPath();
  testValidateMissingTitle();
  testValidateDuplicate();
  testValidateDedupSkippedWithDecision();
  testValidateTitleTooLong();

  // Integration: merge → validate
  testMergeValidateHappyPath();
  testMergeValidateNeedInfo();
  testMergeValidateDedupFlow();

  console.log('All pipeline tests passed.');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
