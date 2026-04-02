/**
 * Tests for individual pipeline steps
 */

const assert = require('assert');
const { enrichContext } = require('../../lobster/lib/tasks/steps/enrich-context');
const { parseRequest } = require('../../lobster/lib/tasks/steps/parse-request');
const { checkCompleteness } = require('../../lobster/lib/tasks/steps/check-completeness');
const { dedupCheck } = require('../../lobster/lib/tasks/steps/dedup-check');
const { buildTaskObject } = require('../../lobster/lib/tasks/steps/build-task-object');
const { publish } = require('../../lobster/lib/tasks/steps/publish');

// --- Step 1: Enrich Context ---

async function testEnrichContext() {
  console.log('Test: enrich context fetches recent tasks');
  const tracker = {
    fetchRecentTasks: async () => [
      { id: 'TASK-1', title: 'Existing task', state: 'Draft' },
    ],
  };
  const context = await enrichContext(tracker);
  assert.strictEqual(context.recentTasks.length, 1);
  assert.strictEqual(context.recentTasks[0].id, 'TASK-1');
}

async function testEnrichContextEmpty() {
  console.log('Test: enrich context with no tasks');
  const tracker = { fetchRecentTasks: async () => [] };
  const context = await enrichContext(tracker);
  assert.strictEqual(context.recentTasks.length, 0);
}

// --- Step 2: Parse Request ---

async function testParseRequestFresh() {
  console.log('Test: parse request on first call (no partial_state)');
  const llm = {
    extractFields: async () => ({ title: 'Fix login bug', description: 'Login fails on invalid email' }),
  };
  const parsed = await parseRequest('fix login', null, {}, llm);
  assert.strictEqual(parsed.title, 'Fix login bug');
  assert.strictEqual(parsed.description, 'Login fails on invalid email');
}

async function testParseRequestMerge() {
  console.log('Test: parse request merges with partial_state');
  const llm = {
    extractFields: async () => ({ title: 'Fix auth bug', description: '' }),
  };
  const partialState = { description: 'Login fails on invalid email' };
  const parsed = await parseRequest('Fix auth bug', partialState, {}, llm);
  // New title overrides, old description preserved (new is empty)
  assert.strictEqual(parsed.title, 'Fix auth bug');
  assert.strictEqual(parsed.description, 'Login fails on invalid email');
}

async function testParseRequestNewOverrides() {
  console.log('Test: parse request new non-null values override partial_state');
  const llm = {
    extractFields: async () => ({ title: 'New title', description: 'New desc' }),
  };
  const partialState = { title: 'Old title', description: 'Old desc' };
  const parsed = await parseRequest('new request', partialState, {}, llm);
  assert.strictEqual(parsed.title, 'New title');
  assert.strictEqual(parsed.description, 'New desc');
}

async function testParseRequestPreservesExtraFields() {
  console.log('Test: parse request preserves extra fields from partial_state');
  const llm = {
    extractFields: async () => ({ title: 'Fix login', description: '' }),
  };
  const partialState = { dedup_decision: 'create_new', description: 'from before' };
  const parsed = await parseRequest('Fix login', partialState, {}, llm);
  assert.strictEqual(parsed.dedup_decision, 'create_new');
  assert.strictEqual(parsed.description, 'from before');
}

// --- Step 3: Check Completeness ---

function testCompletenessWithTitle() {
  console.log('Test: completeness passes with title');
  const result = checkCompleteness({ title: 'Fix login bug' });
  assert.strictEqual(result.complete, true);
}

function testCompletenessMissingTitle() {
  console.log('Test: completeness fails without title');
  const result = checkCompleteness({ description: 'Some desc' });
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.result.type, 'NeedInfo');
  assert.deepStrictEqual(result.result.missing, ['title']);
  assert.strictEqual(result.result.parsed_so_far.description, 'Some desc');
}

function testCompletenessEmptyTitle() {
  console.log('Test: completeness fails with empty title');
  const result = checkCompleteness({ title: '   ', description: 'desc' });
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.result.type, 'NeedInfo');
}

// --- Step 4: Dedup Check ---

function testDedupNoDuplicates() {
  console.log('Test: dedup passes with no duplicates');
  const context = { recentTasks: [{ id: 'TASK-1', title: 'Other task', state: 'Draft' }] };
  const result = dedupCheck({ title: 'Fix login bug' }, context);
  assert.strictEqual(result.clear, true);
}

function testDedupExactMatch() {
  console.log('Test: dedup finds exact match (case-insensitive)');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix Login Bug', state: 'Draft' }] };
  const result = dedupCheck({ title: 'fix login bug' }, context);
  assert.strictEqual(result.clear, false);
  assert.strictEqual(result.result.type, 'NeedDecision');
  assert.strictEqual(result.result.reason, 'duplicate_candidate');
  assert.strictEqual(result.result.candidates[0].id, 'TASK-42');
}

function testDedupSkipsDoneTasks() {
  console.log('Test: dedup ignores Done tasks');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix login bug', state: 'Done' }] };
  const result = dedupCheck({ title: 'Fix login bug' }, context);
  assert.strictEqual(result.clear, true);
}

function testDedupSkipsWithDecision() {
  console.log('Test: dedup skips when dedup_decision present');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix login bug', state: 'Draft' }] };
  const result = dedupCheck({ title: 'Fix login bug', dedup_decision: 'create_new' }, context);
  assert.strictEqual(result.clear, true);
}

function testDedupEmptyRecentTasks() {
  console.log('Test: dedup passes with empty recent tasks');
  const result = dedupCheck({ title: 'Fix login bug' }, { recentTasks: [] });
  assert.strictEqual(result.clear, true);
}

// --- Step 5: Build TaskObject ---

function testBuildValid() {
  console.log('Test: build valid task object');
  const result = buildTaskObject({ title: 'Fix login bug', description: 'Details here' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.task.title, 'Fix login bug');
  assert.strictEqual(result.task.description, 'Details here');
  assert.strictEqual(result.task.state, 'Draft');
}

function testBuildNoDescription() {
  console.log('Test: build task with no description defaults to empty');
  const result = buildTaskObject({ title: 'Fix login bug' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.task.description, '');
}

function testBuildTitleTooLong() {
  console.log('Test: build rejects title exceeding max length');
  const result = buildTaskObject({ title: 'a'.repeat(201) });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.result.type, 'Rejected');
  assert.strictEqual(result.result.reason, 'schema_violation');
}

function testBuildTrimsTitle() {
  console.log('Test: build trims whitespace from title');
  const result = buildTaskObject({ title: '  Fix login bug  ' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.task.title, 'Fix login bug');
}

// --- Step 6: Publish ---

async function testPublish() {
  console.log('Test: publish creates issue and returns Ready');
  const tracker = {
    createIssue: async (task) => ({
      id: 'TASK-43',
      url: 'https://github.com/org/repo/issues/43',
      title: task.title,
    }),
  };
  const task = { title: 'Fix login bug', description: '', state: 'Draft' };
  const result = await publish(task, tracker);
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, 'TASK-43');
  assert.strictEqual(result.task.title, 'Fix login bug');
  assert.ok(result.task.url);
}

// Run all
console.log('=== Pipeline Steps Tests ===');
(async () => {
  // Step 1
  await testEnrichContext();
  await testEnrichContextEmpty();
  // Step 2
  await testParseRequestFresh();
  await testParseRequestMerge();
  await testParseRequestNewOverrides();
  await testParseRequestPreservesExtraFields();
  // Step 3
  testCompletenessWithTitle();
  testCompletenessMissingTitle();
  testCompletenessEmptyTitle();
  // Step 4
  testDedupNoDuplicates();
  testDedupExactMatch();
  testDedupSkipsDoneTasks();
  testDedupSkipsWithDecision();
  testDedupEmptyRecentTasks();
  // Step 5
  testBuildValid();
  testBuildNoDescription();
  testBuildTitleTooLong();
  testBuildTrimsTitle();
  // Step 6
  await testPublish();

  console.log('All step tests passed.');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
