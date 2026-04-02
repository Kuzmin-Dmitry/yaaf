/**
 * Tests for GitHub tracker adapter — verifies it implements
 * the tracker contract (fetchRecentTasks, createIssue).
 */

const assert = require('assert');
const { createGitHubTracker, mapIssueState, resolveToken } = require('../../lobster/lib/github/tracker-adapter');

// --- Mock GitHub client ---

function mockGitHubClient(overrides = {}) {
  return {
    listIssues: async () => [
      { number: 10, title: 'Fix login bug', state: 'open', html_url: 'https://github.com/o/r/issues/10' },
      { number: 9, title: 'Old issue', state: 'closed', html_url: 'https://github.com/o/r/issues/9' },
      { number: 8, title: 'PR title', state: 'open', pull_request: { url: '...' }, html_url: 'https://github.com/o/r/pull/8' },
    ],
    createIssue: async (_owner, _repo, opts) => ({
      number: 42,
      html_url: `https://github.com/${_owner}/${_repo}/issues/42`,
      title: opts.title,
      node_id: 'I_abc123',
    }),
    ...overrides,
  };
}

// --- mapIssueState ---

function testMapOpenState() {
  console.log('Test: map open → Draft');
  assert.strictEqual(mapIssueState('open'), 'Draft');
}

function testMapClosedState() {
  console.log('Test: map closed → Done');
  assert.strictEqual(mapIssueState('closed'), 'Done');
}

// --- fetchRecentTasks ---

async function testFetchRecentTasks() {
  console.log('Test: fetchRecentTasks returns issues (not PRs) in tracker format');
  const tracker = createGitHubTracker({
    owner: 'owner',
    repo: 'repo',
    github: mockGitHubClient(),
  });

  const tasks = await tracker.fetchRecentTasks();

  // Should have 2 items (PR filtered out)
  assert.strictEqual(tasks.length, 2);
  assert.deepStrictEqual(tasks[0], { id: '10', title: 'Fix login bug', state: 'Draft' });
  assert.deepStrictEqual(tasks[1], { id: '9', title: 'Old issue', state: 'Done' });
}

async function testFetchRecentTasksEmpty() {
  console.log('Test: fetchRecentTasks with no issues');
  const tracker = createGitHubTracker({
    owner: 'owner',
    repo: 'repo',
    github: mockGitHubClient({ listIssues: async () => [] }),
  });

  const tasks = await tracker.fetchRecentTasks();
  assert.strictEqual(tasks.length, 0);
}

async function testFetchRecentTasksPassesParams() {
  console.log('Test: fetchRecentTasks passes correct owner/repo to client');
  let capturedOwner, capturedRepo, capturedOpts;
  const tracker = createGitHubTracker({
    owner: 'Kuzmin-Dmitry',
    repo: 'yaaf',
    github: mockGitHubClient({
      listIssues: async (owner, repo, opts) => {
        capturedOwner = owner;
        capturedRepo = repo;
        capturedOpts = opts;
        return [];
      },
    }),
  });

  await tracker.fetchRecentTasks();
  assert.strictEqual(capturedOwner, 'Kuzmin-Dmitry');
  assert.strictEqual(capturedRepo, 'yaaf');
  assert.strictEqual(capturedOpts.state, 'all');
}

async function testFetchRecentTasksAPIError() {
  console.log('Test: fetchRecentTasks throws on API error (infra failure)');
  const tracker = createGitHubTracker({
    owner: 'owner',
    repo: 'repo',
    github: mockGitHubClient({
      listIssues: async () => { throw new Error('GitHub API error: 401 Bad credentials'); },
    }),
  });

  try {
    await tracker.fetchRecentTasks();
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('401'));
  }
}

// --- createIssue ---

async function testCreateIssue() {
  console.log('Test: createIssue returns tracker contract format');
  const tracker = createGitHubTracker({
    owner: 'owner',
    repo: 'repo',
    github: mockGitHubClient(),
  });

  const result = await tracker.createIssue({
    title: 'Fix login bug',
    description: 'Login fails on invalid email',
    state: 'Draft',
  });

  assert.strictEqual(result.id, '42');
  assert.strictEqual(result.title, 'Fix login bug');
  assert.ok(result.url.includes('github.com'));
  assert.ok(result.url.includes('/issues/42'));
}

async function testCreateIssuePassesTitleAndBody() {
  console.log('Test: createIssue passes title and description as body');
  let capturedOpts;
  const tracker = createGitHubTracker({
    owner: 'org',
    repo: 'project',
    github: mockGitHubClient({
      createIssue: async (_owner, _repo, opts) => {
        capturedOpts = opts;
        return { number: 1, html_url: 'https://github.com/org/project/issues/1', title: opts.title };
      },
    }),
  });

  await tracker.createIssue({ title: 'New feature', description: 'Details here', state: 'Draft' });
  assert.strictEqual(capturedOpts.title, 'New feature');
  assert.strictEqual(capturedOpts.body, 'Details here');
}

async function testCreateIssueNoDescription() {
  console.log('Test: createIssue with empty description sends no body');
  let capturedOpts;
  const tracker = createGitHubTracker({
    owner: 'org',
    repo: 'project',
    github: mockGitHubClient({
      createIssue: async (_owner, _repo, opts) => {
        capturedOpts = opts;
        return { number: 1, html_url: 'https://github.com/org/project/issues/1', title: opts.title };
      },
    }),
  });

  await tracker.createIssue({ title: 'Minimal task', description: '', state: 'Draft' });
  assert.strictEqual(capturedOpts.body, undefined);
}

async function testCreateIssueAPIError() {
  console.log('Test: createIssue throws on API error');
  const tracker = createGitHubTracker({
    owner: 'owner',
    repo: 'repo',
    github: mockGitHubClient({
      createIssue: async () => {
        const err = new Error('GitHub API error: 403 Resource not accessible');
        err.status = 403;
        throw err;
      },
    }),
  });

  try {
    await tracker.createIssue({ title: 'Test', description: '', state: 'Draft' });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.status, 403);
  }
}

// --- E2E: adapter works with create_task pipeline ---

async function testAdapterWithPipeline() {
  console.log('Test: adapter integrates with create_task pipeline');
  const { createTask } = require('../../lobster/lib/tasks/create-task');

  const github = mockGitHubClient({
    listIssues: async () => [
      { number: 1, title: 'Existing task', state: 'open' },
    ],
  });

  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github });

  const llm = {
    extractFields: async () => ({ title: 'New feature', description: 'Add dark mode' }),
  };

  const result = await createTask(
    { request: 'create task: New feature — add dark mode', partial_state: null },
    { tracker, llm }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, '42');
  assert.strictEqual(result.task.title, 'New feature');
  assert.ok(result.task.url.includes('github.com'));
}

async function testAdapterDedupWithPipeline() {
  console.log('Test: adapter dedup works — existing GitHub issue triggers NeedDecision');
  const { createTask } = require('../../lobster/lib/tasks/create-task');

  const github = mockGitHubClient({
    listIssues: async () => [
      { number: 5, title: 'Fix login bug', state: 'open' },
    ],
  });

  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github });
  const llm = { extractFields: async () => ({ title: 'Fix login bug', description: '' }) };

  const result = await createTask(
    { request: 'fix login bug', partial_state: null },
    { tracker, llm }
  );

  assert.strictEqual(result.type, 'NeedDecision');
  assert.strictEqual(result.reason, 'duplicate_candidate');
  assert.strictEqual(result.candidates[0].id, '5');
}

// --- resolveToken priority ---

function testResolveTokenExplicit() {
  console.log('Test: resolveToken prefers explicit token');
  const result = resolveToken('explicit-token');
  assert.strictEqual(result, 'explicit-token');
}

function testResolveTokenFromAuthProfiles() {
  console.log('Test: resolveToken falls back to null when no auth-profiles exist');
  const saved = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  // With a non-existent agent dir, resolveToken should return null (no file found)
  const result = resolveToken(undefined, '/tmp/__nonexistent_openclaw_dir__');
  process.env.GITHUB_TOKEN = saved;
  assert.strictEqual(result, null, 'Expected null when no auth-profiles are found');
}

// Run all
console.log('=== GitHub Tracker Adapter Tests ===');
(async () => {
  testMapOpenState();
  testMapClosedState();
  testResolveTokenExplicit();
  testResolveTokenFromAuthProfiles();
  await testFetchRecentTasks();
  await testFetchRecentTasksEmpty();
  await testFetchRecentTasksPassesParams();
  await testFetchRecentTasksAPIError();
  await testCreateIssue();
  await testCreateIssuePassesTitleAndBody();
  await testCreateIssueNoDescription();
  await testCreateIssueAPIError();
  await testAdapterWithPipeline();
  await testAdapterDedupWithPipeline();
  console.log('All GitHub tracker adapter tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
