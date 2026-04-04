/**
 * Tests for create-github-issue pipeline steps.
 */

const assert = require('assert');
const { publishIssue } = require('../../lobster/lib/tasks/cli/cgi-publish');
const { resolveAlias } = require('../../lobster/lib/tasks/cli/cgi-resolve');
const { validateType: validateTypeRich } = require('../../lobster/lib/tasks/cli/cgi-type');
const { parseArg } = require('../../lobster/lib/tasks/cli/cli-io');
const { checkCompleteness } = require('../../lobster/lib/tasks/steps/check-completeness');
const { buildTaskObject } = require('../../lobster/lib/tasks/steps/build-task-object');
const { dedupCheck } = require('../../lobster/lib/tasks/steps/dedup-check');

// --- Helpers ---

function mockGitHub(createdNumber = 42) {
  return {
    createIssue: async (_owner, _repo, opts) => ({
      number: createdNumber,
      html_url: `https://github.com/Kuzmin-Dmitry/yaaf/issues/${createdNumber}`,
      title: opts.title,
      labels: (opts.labels || []).map((name) => ({ name })),
    }),
  };
}

// ============================
// Unit: resolveAlias (cgi-resolve)
// ============================

function testResolveAliasKnown() {
  console.log('Test: resolveAlias — known alias returns project');
  const result = resolveAlias('yaaf');
  assert.ok(result.project);
  assert.strictEqual(result.project.key, 'yaaf');
  assert.ok(result.project.repo.includes('/'));
}

function testResolveAliasUnknown() {
  console.log('Test: resolveAlias — unknown alias returns NeedInfo');
  const result = resolveAlias('foobar');
  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['project_alias']);
  assert.ok(result.known_projects.length > 0);
}

function testResolveAliasCaseInsensitive() {
  console.log('Test: resolveAlias — case insensitive');
  const result = resolveAlias('YAAF');
  assert.ok(result.project);
}

function testResolveAliasEmpty() {
  console.log('Test: resolveAlias — empty string returns NeedInfo');
  const result = resolveAlias('');
  assert.strictEqual(result.type, 'NeedInfo');
}

// ============================
// Unit: validateTypeRich (cgi-type)
// ============================

function testValidateTypeRichValid() {
  console.log('Test: validateTypeRich — valid types return normalized');
  const result = validateTypeRich('Bug');
  assert.ok(result.valid);
  assert.strictEqual(result.normalized, 'bug');
}

function testValidateTypeRichInvalid() {
  console.log('Test: validateTypeRich — invalid type returns valid=false');
  assert.ok(!validateTypeRich('epic').valid);
  assert.ok(!validateTypeRich('').valid);
  assert.ok(!validateTypeRich(null).valid);
}

// ============================
// Unit: parseArg (cli-io)
// ============================

function testParseArgFound() {
  console.log('Test: parseArg — finds flag value');
  assert.strictEqual(parseArg(['--foo', 'bar', '--baz', 'qux'], '--foo'), 'bar');
  assert.strictEqual(parseArg(['--foo', 'bar', '--baz', 'qux'], '--baz'), 'qux');
}

function testParseArgNotFound() {
  console.log('Test: parseArg — returns empty string when flag missing');
  assert.strictEqual(parseArg(['--foo', 'bar'], '--missing'), '');
}

// ============================
// Unit: checkCompleteness + buildTaskObject (step functions)
// ============================

function testBuildTaskValid() {
  console.log('Test: checkCompleteness + buildTaskObject — valid');
  const parsed = { title: 'Fix bug', type: 'bug' };
  const completeness = checkCompleteness(parsed);
  assert.ok(completeness.complete);
  const build = buildTaskObject(parsed);
  assert.ok(build.valid);
  assert.strictEqual(build.task.title, 'Fix bug');
  assert.strictEqual(build.task.state, 'Draft');
}

function testBuildTaskMissingTitle() {
  console.log('Test: checkCompleteness — missing title returns NeedInfo');
  const completeness = checkCompleteness({ type: 'feature' });
  assert.strictEqual(completeness.complete, false);
  assert.strictEqual(completeness.result.type, 'NeedInfo');
  assert.deepStrictEqual(completeness.result.missing, ['title']);
}

function testBuildTaskTitleTooLong() {
  console.log('Test: buildTaskObject — title too long returns Rejected');
  const build = buildTaskObject({ title: 'a'.repeat(201) });
  assert.strictEqual(build.valid, false);
  assert.strictEqual(build.result.type, 'Rejected');
  assert.strictEqual(build.result.reason, 'schema_violation');
}

// ============================
// Unit: dedupCheck
// ============================

function testDedupDuplicate() {
  console.log('Test: dedupCheck — duplicate returns NeedDecision');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix login', state: 'Draft' }] };
  const result = dedupCheck({ title: 'Fix login', type: 'bug' }, context);
  assert.strictEqual(result.clear, false);
  assert.strictEqual(result.result.type, 'NeedDecision');
}

function testDedupSkipped() {
  console.log('Test: dedupCheck — skipped with dedup_decision');
  const context = { recentTasks: [{ id: 'TASK-42', title: 'Fix login', state: 'Draft' }] };
  const result = dedupCheck({ title: 'Fix login', type: 'bug', dedup_decision: 'create_new' }, context);
  assert.strictEqual(result.clear, true);
}

// ============================
// Unit: publishIssue
// ============================

async function testPublishHappyPath() {
  console.log('Test: publishIssue — creates issue with labels');
  const github = mockGitHub(42);
  const task = { title: 'Fix login', body: '## Bug\nDetails', type: 'bug', state: 'Draft' };
  const project = { key: 'yaaf', repo: 'Kuzmin-Dmitry/yaaf' };
  const result = await publishIssue(task, project, github);

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, '42');
  assert.strictEqual(result.task.title, 'Fix login');
  assert.ok(result.task.url.includes('github.com'));
}

async function testPublishNoType() {
  console.log('Test: publishIssue — no type label when type is empty');
  let capturedLabels;
  const github = {
    createIssue: async (_o, _r, opts) => {
      capturedLabels = opts.labels;
      return { number: 1, html_url: 'https://github.com/a/b/issues/1', title: opts.title };
    },
  };
  await publishIssue({ title: 'Task', body: '', type: '', state: 'Draft' }, { key: 'x', repo: 'a/b' }, github);
  assert.deepStrictEqual(capturedLabels, ['status:draft']);
}

async function testPublishWithType() {
  console.log('Test: publishIssue — type label added');
  let capturedLabels;
  const github = {
    createIssue: async (_o, _r, opts) => {
      capturedLabels = opts.labels;
      return { number: 1, html_url: 'https://github.com/a/b/issues/1', title: opts.title };
    },
  };
  await publishIssue({ title: 'Task', body: '', type: 'feature', state: 'Draft' }, { key: 'x', repo: 'a/b' }, github);
  assert.deepStrictEqual(capturedLabels, ['status:draft', 'type:feature']);
}

async function testPublishFailureThrows() {
  console.log('Test: publishIssue — GitHub failure throws');
  const github = { createIssue: async () => { throw new Error('API 503'); } };
  try {
    await publishIssue({ title: 'T', body: '', type: 'bug', state: 'Draft' }, { key: 'x', repo: 'a/b' }, github);
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'API 503');
  }
}

// ============================
// Integration: composed pipeline steps
// ============================

async function testComposedHappyPath() {
  console.log('Test: composed — resolve → type → completeness → build → publish happy path');
  const resolved = resolveAlias('yaaf');
  assert.ok(resolved.project);

  const typeCheck = validateTypeRich('bug');
  assert.ok(typeCheck.valid);

  const parsed = { title: 'Fix login bug', body: '## Bug\nLogin fails on invalid email', type: typeCheck.normalized };

  const dedup = dedupCheck(parsed, { recentTasks: [] });
  assert.ok(dedup.clear);

  const completeness = checkCompleteness(parsed);
  assert.ok(completeness.complete);

  const build = buildTaskObject(parsed);
  assert.ok(build.valid);

  const task = { ...build.task, type: parsed.type, body: parsed.body };
  const github = mockGitHub(99);
  const result = await publishIssue(task, { key: resolved.project.key, repo: resolved.project.repo }, github);

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, '99');
  assert.strictEqual(result.task.title, 'Fix login bug');
}

async function testComposedNeedInfoShortCircuit() {
  console.log('Test: composed — NeedInfo short-circuits before publish');
  const resolved = resolveAlias('unknown');
  assert.strictEqual(resolved.type, 'NeedInfo');
  // In Lobster, cgi-publish.js would pass-through this terminal result
}

async function testComposedDedupFlow() {
  console.log('Test: composed — dedup → NeedDecision → create_new');
  const resolved = resolveAlias('yaaf');
  assert.ok(resolved.project);

  const typeCheck = validateTypeRich('feature');
  assert.ok(typeCheck.valid);

  const context = { recentTasks: [{ id: 'TASK-42', title: 'Add dark mode', state: 'Draft' }] };

  // First call: duplicate found
  const parsed1 = { title: 'Add dark mode', type: typeCheck.normalized };
  const dedup1 = dedupCheck(parsed1, context);
  assert.strictEqual(dedup1.clear, false);

  // Second call: user chose create_new
  const parsed2 = { title: 'Add dark mode', type: typeCheck.normalized, dedup_decision: 'create_new' };
  const dedup2 = dedupCheck(parsed2, context);
  assert.ok(dedup2.clear);

  const build = buildTaskObject(parsed2);
  assert.ok(build.valid);
}

// Run all
console.log('=== Create GitHub Issue Tests ===');
(async () => {
  // cli-io
  testParseArgFound();
  testParseArgNotFound();

  // cgi-resolve
  testResolveAliasKnown();
  testResolveAliasUnknown();
  testResolveAliasCaseInsensitive();
  testResolveAliasEmpty();

  // cgi-type (rich API)
  testValidateTypeRichValid();
  testValidateTypeRichInvalid();

  // checkCompleteness + buildTaskObject
  testBuildTaskValid();
  testBuildTaskMissingTitle();
  testBuildTaskTitleTooLong();

  // dedupCheck
  testDedupDuplicate();
  testDedupSkipped();

  // publishIssue
  await testPublishHappyPath();
  await testPublishNoType();
  await testPublishWithType();
  await testPublishFailureThrows();

  // Composed
  await testComposedHappyPath();
  await testComposedNeedInfoShortCircuit();
  await testComposedDedupFlow();

  console.log('All create-github-issue tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
