/**
 * Tests for create_task pipeline.
 *
 * Tests the programmatic createTask() API
 * AND the shared step functions (merge, validate) used by create-github-issue.
 */

const assert = require('assert');
const { createTask } = require('../../lobster/lib/tasks/create-task');
const { merge, validate } = require('../../lobster/lib/tasks/cli/ct-validate');
const { publish } = require('../../lobster/lib/tasks/steps/publish');

// Helper: build mock tracker
function mockTracker(recentTasks = [], createdId = 'TASK-43') {
  return {
    fetchRecentTasks: async () => recentTasks,
    createIssue: async (task) => ({
      id: createdId,
      url: `https://github.com/org/repo/issues/${createdId}`,
      title: task.title,
    }),
  };
}

// Helper: build mock LLM
function mockLLM(extractResult) {
  return {
    extractFields: async () => extractResult,
  };
}

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
// Integration: merge → validate → publish (shared steps)
// ============================

async function testLobsterPipelineHappyPath() {
  console.log('Test: merge → validate → publish happy path');
  const context = { recentTasks: [] };
  const parsed = merge('Fix login bug', 'Login returns 500', null);
  const validated = validate(parsed, context);
  assert.ok(validated.task);

  const tracker = mockTracker([], 'TASK-43');
  const result = await publish(validated.task, tracker);
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, 'TASK-43');
}

async function testLobsterPipelineNeedInfo() {
  console.log('Test: merge → validate NeedInfo short-circuits before publish');
  const parsed = merge('', '', null);
  const result = validate(parsed, { recentTasks: [] });
  assert.strictEqual(result.type, 'NeedInfo');
}

async function testLobsterPipelineDedupFlow() {
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

  const tracker = mockTracker([], 'TASK-45');
  const result3 = await publish(result2.task, tracker);
  assert.strictEqual(result3.type, 'Ready');
  assert.strictEqual(result3.task.id, 'TASK-45');
}

// ============================
// Backward compat: createTask() programmatic API
// ============================

async function testHappyPath() {
  console.log('Test: createTask() happy path — one invocation, zero questions');
  const result = await createTask(
    { request: 'сделай таск "Fix login bug"', partial_state: null },
    { tracker: mockTracker(), llm: mockLLM({ title: 'Fix login bug', description: 'Login page returns 500' }) }
  );
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, 'TASK-43');
}

async function testMissingTitleCompat() {
  console.log('Test: createTask() missing title — NeedInfo');
  const result = await createTask(
    { request: 'сделай таск', partial_state: null },
    { tracker: mockTracker(), llm: mockLLM({ title: '', description: 'not working' }) }
  );
  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['title']);
}

async function testDuplicateCompat() {
  console.log('Test: createTask() duplicate — NeedDecision');
  const result = await createTask(
    { request: 'fix login', partial_state: null },
    { tracker: mockTracker([{ id: 'TASK-42', title: 'Fix login bug', state: 'Draft' }]), llm: mockLLM({ title: 'Fix login bug', description: '' }) }
  );
  assert.strictEqual(result.type, 'NeedDecision');
}

async function testRejectedCompat() {
  console.log('Test: createTask() rejected — title too long');
  const result = await createTask(
    { request: 'long', partial_state: null },
    { tracker: mockTracker(), llm: mockLLM({ title: 'a'.repeat(201), description: '' }) }
  );
  assert.strictEqual(result.type, 'Rejected');
}

async function testTrackerErrorCompat() {
  console.log('Test: createTask() tracker failure — throws');
  try {
    await createTask(
      { request: 'test', partial_state: null },
      { tracker: { fetchRecentTasks: async () => { throw new Error('Connection refused'); } }, llm: mockLLM({ title: 'T', description: '' }) }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'Connection refused');
  }
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

  // Integration: shared step functions
  await testLobsterPipelineHappyPath();
  await testLobsterPipelineNeedInfo();
  await testLobsterPipelineDedupFlow();

  // Programmatic API: createTask()
  await testHappyPath();
  await testMissingTitleCompat();
  await testDuplicateCompat();
  await testRejectedCompat();
  await testTrackerErrorCompat();

  console.log('All pipeline tests passed.');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
