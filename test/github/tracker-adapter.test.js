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
      { number: 10, title: 'Fix login bug', state: 'open', labels: [{ name: 'status:draft' }], html_url: 'https://github.com/o/r/issues/10' },
      { number: 9, title: 'Old issue', state: 'closed', labels: [], html_url: 'https://github.com/o/r/issues/9' },
      { number: 8, title: 'PR title', state: 'open', labels: [], pull_request: { url: '...' }, html_url: 'https://github.com/o/r/pull/8' },
    ],
    createIssue: async (_owner, _repo, opts) => ({
      number: 42,
      html_url: `https://github.com/${_owner}/${_repo}/issues/42`,
      title: opts.title,
      node_id: 'I_abc123',
    }),
    getIssue: async (_owner, _repo, issueNumber) => ({
      number: Number(issueNumber),
      title: 'Fix login bug',
      state: 'open',
      labels: [{ name: 'status:draft' }],
    }),
    addLabels: async () => [],
    removeLabel: async () => [],
    ...overrides,
  };
}

// --- mapIssueState ---

function testMapOpenState() {
  console.log('Test: map open → Draft (no labels)');
  assert.strictEqual(mapIssueState('open'), 'Draft');
}

function testMapClosedState() {
  console.log('Test: map closed → Done (no labels)');
  assert.strictEqual(mapIssueState('closed'), 'Done');
}

function testMapStateFromLabels() {
  console.log('Test: map state from status:backlog label');
  assert.strictEqual(mapIssueState('open', [{ name: 'status:backlog' }]), 'Backlog');
}

function testMapStateFromReadyLabel() {
  console.log('Test: map state from status:ready label');
  assert.strictEqual(mapIssueState('open', [{ name: 'status:ready' }]), 'Ready');
}

function testMapStateLabelOverridesGHState() {
  console.log('Test: label overrides closed state');
  assert.strictEqual(mapIssueState('closed', [{ name: 'status:in-review' }]), 'InReview');
}

function testMapStateNoStatusLabel() {
  console.log('Test: non-status labels fall back to GH state');
  assert.strictEqual(mapIssueState('open', [{ name: 'bug' }, { name: 'priority:high' }]), 'Draft');
}

function testMapStateStringLabels() {
  console.log('Test: map state from string labels array');
  assert.strictEqual(mapIssueState('open', ['status:backlog']), 'Backlog');
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

// --- createIssue attaches status:draft label ---

async function testCreateIssueAttachesDraftLabel() {
  console.log('Test: createIssue includes status:draft label');
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

  await tracker.createIssue({ title: 'New feature', description: 'Details', state: 'Draft' });
  assert.ok(Array.isArray(capturedOpts.labels), 'labels should be an array');
  assert.ok(capturedOpts.labels.includes('status:draft'), 'should include status:draft label');
}

// --- fetchIssue ---

async function testFetchIssue() {
  console.log('Test: fetchIssue returns issue with state from labels');
  const tracker = createGitHubTracker({
    owner: 'owner',
    repo: 'repo',
    github: mockGitHubClient(),
  });

  const issue = await tracker.fetchIssue('10');
  assert.strictEqual(issue.id, '10');
  assert.strictEqual(issue.title, 'Fix login bug');
  assert.strictEqual(issue.state, 'Draft');
  assert.ok(Array.isArray(issue.labels));
}

async function testFetchIssuePassesCorrectId() {
  console.log('Test: fetchIssue passes correct issue number to client');
  let capturedId;
  const tracker = createGitHubTracker({
    owner: 'org',
    repo: 'proj',
    github: mockGitHubClient({
      getIssue: async (_o, _r, id) => {
        capturedId = id;
        return { number: 42, title: 'Test', state: 'open', labels: [] };
      },
    }),
  });

  await tracker.fetchIssue('42');
  assert.strictEqual(capturedId, '42');
}

// --- approveIssue ---

async function testApproveIssueDraftToBacklog() {
  console.log('Test: approveIssue Draft → Backlog swaps labels');
  let removedLabel, addedLabels;
  const tracker = createGitHubTracker({
    owner: 'org',
    repo: 'proj',
    github: mockGitHubClient({
      getIssue: async () => ({
        number: 10,
        title: 'Test',
        state: 'open',
        labels: [{ name: 'status:draft' }],
      }),
      removeLabel: async (_o, _r, _n, label) => { removedLabel = label; return []; },
      addLabels: async (_o, _r, _n, labels) => { addedLabels = labels; return []; },
    }),
  });

  const result = await tracker.approveIssue('10');
  assert.strictEqual(result.previousState, 'Draft');
  assert.strictEqual(result.newState, 'Backlog');
  assert.strictEqual(removedLabel, 'status:draft');
  assert.deepStrictEqual(addedLabels, ['status:backlog']);
}

async function testApproveIssueBacklogToReady() {
  console.log('Test: approveIssue Backlog → Ready swaps labels');
  let removedLabel, addedLabels;
  const tracker = createGitHubTracker({
    owner: 'org',
    repo: 'proj',
    github: mockGitHubClient({
      getIssue: async () => ({
        number: 20,
        title: 'Test',
        state: 'open',
        labels: [{ name: 'status:backlog' }],
      }),
      removeLabel: async (_o, _r, _n, label) => { removedLabel = label; return []; },
      addLabels: async (_o, _r, _n, labels) => { addedLabels = labels; return []; },
    }),
  });

  const result = await tracker.approveIssue('20');
  assert.strictEqual(result.previousState, 'Backlog');
  assert.strictEqual(result.newState, 'Ready');
  assert.strictEqual(removedLabel, 'status:backlog');
  assert.deepStrictEqual(addedLabels, ['status:ready']);
}

async function testApproveIssueReadyThrows() {
  console.log('Test: approveIssue Ready → throws');
  const tracker = createGitHubTracker({
    owner: 'org',
    repo: 'proj',
    github: mockGitHubClient({
      getIssue: async () => ({
        number: 30,
        title: 'Test',
        state: 'open',
        labels: [{ name: 'status:ready' }],
      }),
    }),
  });

  try {
    await tracker.approveIssue('30');
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Cannot approve'));
    assert.ok(err.message.includes('Ready'));
  }
}

// Run all
console.log('=== GitHub Tracker Adapter Tests ===');
(async () => {
  testMapOpenState();
  testMapClosedState();
  testMapStateFromLabels();
  testMapStateFromReadyLabel();
  testMapStateLabelOverridesGHState();
  testMapStateNoStatusLabel();
  testMapStateStringLabels();
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
  await testCreateIssueAttachesDraftLabel();
  await testFetchIssue();
  await testFetchIssuePassesCorrectId();
  await testApproveIssueDraftToBacklog();
  await testApproveIssueBacklogToReady();
  await testApproveIssueReadyThrows();
  console.log('All GitHub tracker adapter tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
