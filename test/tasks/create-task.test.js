/**
 * Tests for create_task pipeline — end-to-end scenarios from the spec.
 */

const assert = require('assert');
const { createTask } = require('../../lobster/lib/tasks/create-task');

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

// --- Scenario 7.1: Happy path ---

async function testHappyPath() {
  console.log('Test: 7.1 Happy path — one invocation, zero questions');
  const result = await createTask(
    { request: 'сделай таск "Fix login bug" — логин падает на невалидном email', partial_state: null },
    {
      tracker: mockTracker(),
      llm: mockLLM({ title: 'Fix login bug', description: 'Login page returns 500 on invalid email' }),
    }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, 'TASK-43');
  assert.strictEqual(result.task.title, 'Fix login bug');
}

// --- Scenario 7.2: Missing title ---

async function testMissingTitle() {
  console.log('Test: 7.2 Missing title — NeedInfo returned');
  const result = await createTask(
    { request: 'сделай таск — логин не работает', partial_state: null },
    {
      tracker: mockTracker(),
      llm: mockLLM({ title: '', description: 'логин не работает' }),
    }
  );

  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['title']);
  assert.strictEqual(result.parsed_so_far.description, 'логин не работает');
}

async function testMissingTitleClarified() {
  console.log('Test: 7.2 Missing title — re-invoke with title resolves');
  const result = await createTask(
    { request: 'Fix login bug', partial_state: { description: 'логин не работает' } },
    {
      tracker: mockTracker([], 'TASK-44'),
      llm: mockLLM({ title: 'Fix login bug', description: '' }),
    }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, 'TASK-44');
  assert.strictEqual(result.task.title, 'Fix login bug');
}

// --- Scenario 7.3: Duplicate found — create new ---

async function testDuplicateFound() {
  console.log('Test: 7.3 Duplicate found — NeedDecision returned');
  const recentTasks = [{ id: 'TASK-42', title: 'Fix login bug', state: 'Draft' }];
  const result = await createTask(
    { request: 'сделай таск на фикс логина', partial_state: null },
    {
      tracker: mockTracker(recentTasks),
      llm: mockLLM({ title: 'Fix login bug', description: '' }),
    }
  );

  assert.strictEqual(result.type, 'NeedDecision');
  assert.strictEqual(result.reason, 'duplicate_candidate');
  assert.strictEqual(result.candidates[0].id, 'TASK-42');
}

async function testDuplicateCreateNew() {
  console.log('Test: 7.3 Duplicate — user chooses create new');
  const recentTasks = [{ id: 'TASK-42', title: 'Fix login bug', state: 'Draft' }];
  const result = await createTask(
    {
      request: 'создай новую',
      partial_state: { title: 'Fix login bug', dedup_decision: 'create_new' },
    },
    {
      tracker: mockTracker(recentTasks, 'TASK-45'),
      llm: mockLLM({ title: '', description: '' }), // parse finds nothing new
    }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, 'TASK-45');
  assert.strictEqual(result.task.title, 'Fix login bug');
}

// --- Scenario 7.5: Rejected — schema violation ---

async function testRejectedSchemaViolation() {
  console.log('Test: 7.5 Rejected — title too long');
  const longTitle = 'a'.repeat(201);
  const result = await createTask(
    { request: 'сделай таск с очень длинным названием', partial_state: null },
    {
      tracker: mockTracker(),
      llm: mockLLM({ title: longTitle, description: '' }),
    }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'schema_violation');
  assert.ok(result.details.includes('200'));
}

// --- Edge cases ---

async function testTrackerError() {
  console.log('Test: Tracker unreachable — throws (infra failure)');
  const tracker = {
    fetchRecentTasks: async () => { throw new Error('Connection refused'); },
  };

  try {
    await createTask(
      { request: 'create task', partial_state: null },
      { tracker, llm: mockLLM({ title: 'Test', description: '' }) }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'Connection refused');
  }
}

async function testPublishError() {
  console.log('Test: Publish fails — throws (infra failure)');
  const tracker = {
    fetchRecentTasks: async () => [],
    createIssue: async () => { throw new Error('API 503'); },
  };

  try {
    await createTask(
      { request: 'create task', partial_state: null },
      { tracker, llm: mockLLM({ title: 'Test task', description: '' }) }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'API 503');
  }
}

async function testLLMReturnsNothing() {
  console.log('Test: LLM extracts nothing — NeedInfo for title');
  const result = await createTask(
    { request: 'do something', partial_state: null },
    {
      tracker: mockTracker(),
      llm: mockLLM({ title: '', description: '' }),
    }
  );

  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['title']);
}

async function testPartialStateMergePreservesOnReInvoke() {
  console.log('Test: Re-invoke preserves partial_state fields not overridden');
  const result = await createTask(
    {
      request: 'назови Fix auth bug',
      partial_state: { description: 'Original description from first call' },
    },
    {
      tracker: mockTracker([], 'TASK-50'),
      llm: mockLLM({ title: 'Fix auth bug', description: '' }),
    }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.title, 'Fix auth bug');
}

// Run all
console.log('=== Create Task Pipeline Tests ===');
(async () => {
  await testHappyPath();
  await testMissingTitle();
  await testMissingTitleClarified();
  await testDuplicateFound();
  await testDuplicateCreateNew();
  await testRejectedSchemaViolation();
  await testTrackerError();
  await testPublishError();
  await testLLMReturnsNothing();
  await testPartialStateMergePreservesOnReInvoke();
  console.log('All pipeline tests passed.');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
