/**
 * Tests for GitHub tracker adapter — verifies it implements
 * the tracker contract (fetchRecentTasks, createIssue).
 */

const assert = require('assert');
const { createGitHubTracker, mapIssueState, resolveToken, TrackerError } = require('../../lobster/lib/github/tracker-adapter');

// Set-equivalence assertion for label arrays (order doesn't matter).
function assertSameLabelSet(actual, expected, msg) {
  assert.strictEqual(
    Array.isArray(actual),
    true,
    `${msg || 'labels'}: expected array, got ${typeof actual}`
  );
  assert.strictEqual(
    actual.length,
    expected.length,
    `${msg || 'labels'}: length ${actual.length} vs expected ${expected.length} (actual=${JSON.stringify(actual)})`
  );
  const a = [...actual].sort();
  const e = [...expected].sort();
  assert.deepStrictEqual(a, e, msg);
}

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

// --- approveIssue (atomic transitions via setLabels) ---

// Shared helper — mock with counters for mutating label methods.
function mockTrackerClient(overrides = {}) {
  const calls = { setLabels: [], addLabels: [], removeLabel: [] };
  const base = {
    getIssue: async (_o, _r, issueNumber) => ({
      number: Number(issueNumber),
      title: 'Test',
      state: 'open',
      labels: [],
    }),
    setLabels: async (_o, _r, n, labels) => {
      calls.setLabels.push({ n, labels });
      return labels.map((name) => ({ name }));
    },
    addLabels: async (_o, _r, n, labels) => {
      calls.addLabels.push({ n, labels });
      return [];
    },
    removeLabel: async (_o, _r, n, label) => {
      calls.removeLabel.push({ n, label });
      return [];
    },
    ...overrides,
  };
  return { client: base, calls };
}

// S1: Draft → Backlog with one non-status label preserved.
async function testApproveIssueDraftToBacklog() {
  console.log('Test: S1 — approveIssue Draft→Backlog replaces labels atomically');
  const { client, calls } = mockTrackerClient({
    getIssue: async () => ({
      number: 10,
      title: 'Fix login bug',
      state: 'open',
      labels: [{ name: 'status:draft' }, { name: 'type:bug' }],
    }),
  });
  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github: client });

  const result = await tracker.approveIssue('10');

  assert.strictEqual(result.id, '10');
  assert.strictEqual(result.title, 'Fix login bug');
  assert.strictEqual(result.previousState, 'Draft');
  assert.strictEqual(result.newState, 'Backlog');

  assert.strictEqual(calls.setLabels.length, 1, 'setLabels must be called exactly once');
  assert.strictEqual(calls.addLabels.length, 0, 'addLabels must not be called');
  assert.strictEqual(calls.removeLabel.length, 0, 'removeLabel must not be called');
  assertSameLabelSet(calls.setLabels[0].labels, ['type:bug', 'status:backlog']);
}

// S2: Backlog → Ready with multiple non-status labels (all preserved).
async function testApproveIssueBacklogToReadyPreservesNonStatusLabels() {
  console.log('Test: S2 — approveIssue preserves all non-status labels');
  const { client, calls } = mockTrackerClient({
    getIssue: async () => ({
      number: 55,
      title: 'Ship feature X',
      state: 'open',
      labels: [
        { name: 'status:backlog' },
        { name: 'type:feature' },
        { name: 'reviewed:architecture' },
        { name: 'priority:p1' },
      ],
    }),
  });
  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github: client });

  const result = await tracker.approveIssue('55');

  assert.strictEqual(result.previousState, 'Backlog');
  assert.strictEqual(result.newState, 'Ready');

  assert.strictEqual(calls.setLabels.length, 1);
  assertSameLabelSet(
    calls.setLabels[0].labels,
    ['type:feature', 'reviewed:architecture', 'priority:p1', 'status:ready'],
  );
  // Old status:backlog must NOT leak into the new set.
  assert.ok(!calls.setLabels[0].labels.includes('status:backlog'), 'old status label must not leak');
}

// S3 (idempotency): issue without any status:* label → mapIssueState returns 'Draft'
// for open issues, transition goes to Backlog, non-status labels preserved.
async function testApproveIssueWithoutStatusLabel() {
  console.log('Test: S3 — approveIssue on issue without status:* label (treated as Draft)');
  const { client, calls } = mockTrackerClient({
    getIssue: async () => ({
      number: 77,
      title: 'Legacy issue',
      state: 'open',
      labels: [{ name: 'type:bug' }],
    }),
  });
  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github: client });

  const result = await tracker.approveIssue('77');

  assert.strictEqual(result.previousState, 'Draft');
  assert.strictEqual(result.newState, 'Backlog');
  assert.strictEqual(calls.setLabels.length, 1);
  assertSameLabelSet(calls.setLabels[0].labels, ['type:bug', 'status:backlog']);
}

// S3b: existing guard — state with no valid transition still throws (not TrackerError;
// this is a validation failure before any mutation).
async function testApproveIssueReadyThrows() {
  console.log('Test: S3b — approveIssue on Ready throws (no valid transition)');
  const { client, calls } = mockTrackerClient({
    getIssue: async () => ({
      number: 30,
      title: 'Test',
      state: 'open',
      labels: [{ name: 'status:ready' }],
    }),
  });
  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github: client });

  await assert.rejects(
    () => tracker.approveIssue('30'),
    (err) => {
      assert.ok(err.message.includes('Cannot approve'), 'expected Cannot approve in message');
      assert.ok(err.message.includes('Ready'), 'expected Ready in message');
      assert.ok(!(err instanceof TrackerError), 'pre-mutation validation must not wrap as TrackerError');
      return true;
    },
  );
  assert.strictEqual(calls.setLabels.length, 0, 'setLabels must not be called on invalid transition');
}

// S4: setLabels failure is wrapped as TrackerError with code 'transition_failed'.
async function testApproveIssueTransitionFailedWrapsAsTrackerError() {
  console.log('Test: S4 — setLabels failure → TrackerError { code: transition_failed }');
  const { client, calls } = mockTrackerClient({
    getIssue: async () => ({
      number: 88,
      title: 'Test',
      state: 'open',
      labels: [{ name: 'status:draft' }],
    }),
    setLabels: async () => {
      const err = new Error('500 Internal Server Error');
      err.status = 500;
      throw err;
    },
  });
  const tracker = createGitHubTracker({ owner: 'org', repo: 'proj', github: client });

  await assert.rejects(
    () => tracker.approveIssue('88'),
    (err) => {
      assert.ok(err instanceof TrackerError, `expected TrackerError, got ${err && err.name}`);
      assert.strictEqual(err.code, 'transition_failed');
      assert.ok(err.cause instanceof Error, 'expected cause to be Error');
      assert.strictEqual(err.cause.message, '500 Internal Server Error');
      assert.ok(err.message.includes('#88'), 'message should mention issue number');
      assert.ok(err.message.includes('Draft'), 'message should mention source state');
      assert.ok(err.message.includes('Backlog'), 'message should mention target state');
      return true;
    },
  );
  // Confirm nothing else was called during the failed transition.
  assert.strictEqual(calls.addLabels.length, 0);
  assert.strictEqual(calls.removeLabel.length, 0);
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
  await testApproveIssueBacklogToReadyPreservesNonStatusLabels();
  await testApproveIssueWithoutStatusLabel();
  await testApproveIssueReadyThrows();
  await testApproveIssueTransitionFailedWrapsAsTrackerError();
  console.log('All GitHub tracker adapter tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
