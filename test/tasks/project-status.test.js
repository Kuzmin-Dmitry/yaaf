/**
 * Tests for project_status pipeline.
 */

const assert = require('assert');
const { projectStatus } = require('../../lobster/lib/tasks/project-status');
const { aggregateStatus, formatBrief } = require('../../lobster/lib/tasks/project-status-model');

// --- Helpers ---

function mockGitHub(pages) {
  return {
    listIssues: async (_owner, _repo, opts) => {
      const page = opts.page || 1;
      return pages[page - 1] || [];
    },
  };
}

function mockClock(iso = '2026-04-02T12:00:00.000Z') {
  return { now: () => new Date(iso) };
}

function ghIssue(number, title, { labels = [], isPR = false, updated_at = '2026-04-01T12:00:00Z' } = {}) {
  const issue = {
    number,
    title,
    html_url: `https://github.com/Kuzmin-Dmitry/yaaf/issues/${number}`,
    labels: labels.map((name) => ({ name })),
    assignees: [],
    updated_at,
    created_at: '2026-03-01T12:00:00Z',
  };
  if (isPR) issue.pull_request = { url: 'https://api.github.com/...' };
  return issue;
}

// ============================
// Unit: aggregateStatus
// ============================

function testAggregateBasic() {
  console.log('Test: aggregate counts issues by status');
  const issues = [
    { number: 1, title: 'A', labels: ['status:todo'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 2, title: 'B', labels: ['status:in-progress'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 3, title: 'C', labels: ['status:in-progress'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 4, title: 'D', labels: [], updated_at: '2026-04-01T12:00:00Z' },
    { number: 5, title: 'E', labels: ['status:in-review'], updated_at: '2026-04-01T12:00:00Z' },
  ];
  const stats = aggregateStatus(issues, 7, new Date('2026-04-02T12:00:00Z'));

  assert.strictEqual(stats.total_open, 5);
  assert.strictEqual(stats.by_status.todo, 1);
  assert.strictEqual(stats.by_status['in-progress'], 2);
  assert.strictEqual(stats.by_status['in-review'], 1);
  assert.strictEqual(stats.by_status.unlabeled, 1);
  assert.strictEqual(stats.by_status.rework, 0);
}

function testAggregateStaleDetection() {
  console.log('Test: aggregate detects stale issues via clock');
  const issues = [
    { number: 1, title: 'Recent', labels: ['status:todo'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 2, title: 'Stale', labels: ['status:todo'], updated_at: '2026-03-20T12:00:00Z' },
  ];
  const stats = aggregateStatus(issues, 7, new Date('2026-04-02T12:00:00Z'));
  assert.strictEqual(stats.stale_count, 1);
}

function testAggregateUnknownStatusLabel() {
  console.log('Test: unknown status:* label counts as unlabeled');
  const issues = [
    { number: 1, title: 'A', labels: ['status:blocked'], updated_at: '2026-04-01T12:00:00Z' },
  ];
  const stats = aggregateStatus(issues, 7, new Date('2026-04-02T12:00:00Z'));
  assert.strictEqual(stats.by_status.unlabeled, 1);
}

function testAggregateMultipleStatusLabels() {
  console.log('Test: multiple status labels — picks first alphabetically');
  const issues = [
    { number: 1, title: 'A', labels: ['status:in-review', 'status:in-progress'], updated_at: '2026-04-01T12:00:00Z' },
  ];
  const stats = aggregateStatus(issues, 7, new Date('2026-04-02T12:00:00Z'));
  assert.strictEqual(stats.by_status['in-progress'], 1);
  assert.strictEqual(stats.by_status['in-review'], 0);
}

// ============================
// Unit: formatBrief
// ============================

function testFormatBrief() {
  console.log('Test: format brief produces readable output');
  const stats = { total_open: 5, by_status: { todo: 2, 'in-progress': 2, 'in-review': 1, rework: 0, unlabeled: 0 }, stale_count: 0 };
  const brief = formatBrief('yaaf', stats);
  assert.ok(brief.includes('Status yaaf: 5 open issues.'));
  assert.ok(brief.includes('In progress: 2'));
  assert.ok(!brief.includes('Stale'));
}

function testFormatBriefWithStale() {
  console.log('Test: format brief includes stale count');
  const stats = { total_open: 3, by_status: { todo: 3, 'in-progress': 0, 'in-review': 0, rework: 0, unlabeled: 0 }, stale_count: 2 };
  const brief = formatBrief('yaaf', stats);
  assert.ok(brief.includes('Stale: 2.'));
}

// ============================
// E2E: projectStatus pipeline
// ============================

async function testHappyPath() {
  console.log('Test: happy path — Ready with stats');
  const issues = [
    ghIssue(1, 'Fix auth flow', { labels: ['status:in-progress'] }),
    ghIssue(2, 'Add tests', { labels: ['status:todo'] }),
    ghIssue(3, 'Review API', { labels: ['status:in-review'] }),
    ghIssue(4, 'Bug report'),
  ];

  const result = await projectStatus(
    { request: 'дай статус по проекту yaaf', project_alias: 'yaaf' },
    { github: mockGitHub([issues]), clock: mockClock() }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.project.key, 'yaaf');
  assert.strictEqual(result.stats.total_open, 4);
  assert.ok(result.brief.includes('Status yaaf'));
  assert.ok(result.generated_at);
}

async function testNeedInfoMissingAlias() {
  console.log('Test: missing alias — NeedInfo');
  const result = await projectStatus(
    { request: 'дай статус', project_alias: null },
    { github: mockGitHub([]), clock: mockClock() }
  );

  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['project_alias']);
  assert.ok(result.known_projects.length > 0);
}

async function testNeedInfoUnknownAlias() {
  console.log('Test: unknown alias — NeedInfo');
  const result = await projectStatus(
    { request: 'status foobar', project_alias: 'foobar' },
    { github: mockGitHub([]), clock: mockClock() }
  );

  assert.strictEqual(result.type, 'NeedInfo');
}

async function testFiltersPullRequests() {
  console.log('Test: filters out pull requests');
  const issues = [
    ghIssue(1, 'Real issue'),
    ghIssue(2, 'A PR', { isPR: true }),
  ];

  const result = await projectStatus(
    { request: 'status yaaf', project_alias: 'yaaf' },
    { github: mockGitHub([issues]), clock: mockClock() }
  );

  assert.strictEqual(result.stats.total_open, 1);
}

async function testPagination() {
  console.log('Test: paginates through multiple pages');
  const page1 = Array.from({ length: 100 }, (_, i) => ghIssue(i + 1, `Issue ${i + 1}`));
  const page2 = [ghIssue(101, 'Issue 101')];

  const result = await projectStatus(
    { request: 'status yaaf', project_alias: 'yaaf' },
    { github: mockGitHub([page1, page2]), clock: mockClock() }
  );

  assert.strictEqual(result.stats.total_open, 101);
}

async function testEmptyRepo() {
  console.log('Test: empty repo — Ready with zeros');
  const result = await projectStatus(
    { request: 'status yaaf', project_alias: 'yaaf' },
    { github: mockGitHub([[]]), clock: mockClock() }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.stats.total_open, 0);
}

async function testGitHubFailureThrows() {
  console.log('Test: GitHub failure — throws');
  const failing = { listIssues: async () => { throw new Error('Connection refused'); } };

  try {
    await projectStatus(
      { request: 'status yaaf', project_alias: 'yaaf' },
      { github: failing, clock: mockClock() }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'Connection refused');
  }
}

async function testCaseInsensitiveAlias() {
  console.log('Test: alias resolution is case-insensitive');
  const result = await projectStatus(
    { request: 'status YAAF', project_alias: 'YAAF' },
    { github: mockGitHub([[]]), clock: mockClock() }
  );
  assert.strictEqual(result.type, 'Ready');
}

// Run all
console.log('=== Project Status Tests ===');
(async () => {
  testAggregateBasic();
  testAggregateStaleDetection();
  testAggregateUnknownStatusLabel();
  testAggregateMultipleStatusLabels();
  testFormatBrief();
  testFormatBriefWithStale();

  await testHappyPath();
  await testNeedInfoMissingAlias();
  await testNeedInfoUnknownAlias();
  await testFiltersPullRequests();
  await testPagination();
  await testEmptyRepo();
  await testGitHubFailureThrows();
  await testCaseInsensitiveAlias();

  console.log('All project status tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
