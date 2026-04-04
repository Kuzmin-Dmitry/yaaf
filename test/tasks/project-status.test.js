/**
 * Tests for project_status Lobster pipeline steps.
 *
 * Unit tests for each CLI step function + model functions.
 * Steps: resolve → fetch → aggregate (piped via Lobster).
 */

const assert = require('assert');
const { resolve } = require('../../lobster/lib/tasks/cli/ps-resolve');
const { fetchAllOpenIssues } = require('../../lobster/lib/tasks/cli/ps-fetch');
const { aggregate } = require('../../lobster/lib/tasks/cli/ps-aggregate');
const { aggregateStatus, formatBrief, formatTelegramBrief, resolveProject, listKnownProjects } = require('../../lobster/lib/tasks/project-status-model');

// --- Helpers ---

function mockGitHub(pages) {
  return {
    listIssues: async (_owner, _repo, opts) => {
      const page = opts.page || 1;
      return pages[page - 1] || [];
    },
  };
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
// Unit: resolveProject / listKnownProjects
// ============================

function testResolveKnown() {
  console.log('Test: resolveProject finds known alias');
  const p = resolveProject('yaaf');
  assert.ok(p);
  assert.strictEqual(p.key, 'yaaf');
  assert.strictEqual(p.repo, 'Kuzmin-Dmitry/yaaf');
}

function testResolveCaseInsensitive() {
  console.log('Test: resolveProject is case-insensitive');
  assert.ok(resolveProject('YAAF'));
  assert.ok(resolveProject(' Yaaf '));
}

function testResolveUnknown() {
  console.log('Test: resolveProject returns null for unknown');
  assert.strictEqual(resolveProject('foobar'), null);
  assert.strictEqual(resolveProject(null), null);
  assert.strictEqual(resolveProject(''), null);
}

function testListKnown() {
  console.log('Test: listKnownProjects returns all projects');
  const list = listKnownProjects();
  assert.ok(list.length > 0);
  assert.ok(list[0].key);
  assert.ok(list[0].repo);
}

// ============================
// Unit: resolve step
// ============================

function testResolveStepKnown() {
  console.log('Test: resolve step — known alias returns project');
  const result = resolve('yaaf');
  assert.ok(result.project);
  assert.strictEqual(result.project.key, 'yaaf');
  assert.ok(!result.type);
}

function testResolveStepUnknown() {
  console.log('Test: resolve step — unknown alias returns NeedInfo');
  const result = resolve('foobar');
  assert.strictEqual(result.type, 'NeedInfo');
  assert.deepStrictEqual(result.missing, ['project_alias']);
  assert.ok(result.known_projects.length > 0);
}

function testResolveStepNull() {
  console.log('Test: resolve step — null alias returns NeedInfo');
  const result = resolve(null);
  assert.strictEqual(result.type, 'NeedInfo');
}

function testResolveStepCaseInsensitive() {
  console.log('Test: resolve step — case-insensitive');
  const result = resolve('YAAF');
  assert.ok(result.project);
  assert.strictEqual(result.project.key, 'yaaf');
}

// ============================
// Unit: fetchAllOpenIssues
// ============================

async function testFetchFiltersPRs() {
  console.log('Test: fetch filters out pull requests');
  const github = mockGitHub([[
    ghIssue(1, 'Real issue'),
    ghIssue(2, 'A PR', { isPR: true }),
  ]]);
  const issues = await fetchAllOpenIssues(github, 'Kuzmin-Dmitry', 'yaaf');
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].number, 1);
}

async function testFetchPaginates() {
  console.log('Test: fetch paginates through multiple pages');
  const page1 = Array.from({ length: 100 }, (_, i) => ghIssue(i + 1, `Issue ${i + 1}`));
  const page2 = [ghIssue(101, 'Issue 101')];
  const github = mockGitHub([page1, page2]);
  const issues = await fetchAllOpenIssues(github, 'Kuzmin-Dmitry', 'yaaf');
  assert.strictEqual(issues.length, 101);
}

async function testFetchEmpty() {
  console.log('Test: fetch handles empty repo');
  const github = mockGitHub([[]]);
  const issues = await fetchAllOpenIssues(github, 'Kuzmin-Dmitry', 'yaaf');
  assert.strictEqual(issues.length, 0);
}

async function testFetchFailureThrows() {
  console.log('Test: fetch throws on GitHub failure');
  const failing = { listIssues: async () => { throw new Error('Connection refused'); } };
  try {
    await fetchAllOpenIssues(failing, 'Kuzmin-Dmitry', 'yaaf');
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'Connection refused');
  }
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
  assert.strictEqual(stats.by_status.draft, 0);
  assert.strictEqual(stats.by_status.backlog, 0);
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

function testAggregateDraftBacklogLabels() {
  console.log('Test: draft/backlog/ready/done labels counted correctly');
  const issues = [
    { number: 1, title: 'A', labels: ['status:draft'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 2, title: 'B', labels: ['status:backlog'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 3, title: 'C', labels: ['status:ready'], updated_at: '2026-04-01T12:00:00Z' },
    { number: 4, title: 'D', labels: ['status:done'], updated_at: '2026-04-01T12:00:00Z' },
  ];
  const stats = aggregateStatus(issues, 7, new Date('2026-04-02T12:00:00Z'));
  assert.strictEqual(stats.by_status.draft, 1);
  assert.strictEqual(stats.by_status.backlog, 1);
  assert.strictEqual(stats.by_status.ready, 1);
  assert.strictEqual(stats.by_status.done, 1);
  assert.strictEqual(stats.by_status.unlabeled, 0);
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
  console.log('Test: format brief — plain-text version of telegram brief');
  const stats = { total_open: 5, by_status: { draft: 0, backlog: 0, ready: 0, todo: 2, 'in-progress': 2, 'in-review': 1, rework: 0, done: 0, unlabeled: 0 }, stale_count: 0 };
  const brief = formatBrief('yaaf', stats);
  assert.ok(brief.includes('Status: yaaf'));
  assert.ok(brief.includes('5 open'));
  assert.ok(brief.includes('in-progress: 2'));
  assert.ok(!brief.includes('<b>'), 'no HTML tags in plain brief');
  assert.ok(!brief.includes('Stale'));
}

function testFormatBriefWithStale() {
  console.log('Test: format brief includes stale count');
  const stats = { total_open: 3, by_status: { draft: 0, backlog: 0, ready: 0, todo: 3, 'in-progress': 0, 'in-review': 0, rework: 0, done: 0, unlabeled: 0 }, stale_count: 2 };
  const brief = formatBrief('yaaf', stats);
  assert.ok(brief.includes('Stale: 2'));
}

// ============================
// Unit: formatTelegramBrief
// ============================

function testTelegramBriefFormat() {
  console.log('Test: telegram brief — HTML tags, one status per line, empty compact');
  const stats = { total_open: 3, by_status: { draft: 1, backlog: 1, ready: 0, todo: 1, 'in-progress': 0, 'in-review': 0, rework: 0, done: 0, unlabeled: 0 }, stale_count: 1 };
  const tg = formatTelegramBrief('yaaf', stats);
  // HTML bold header
  assert.ok(tg.includes('<b>Status: yaaf</b>'));
  // Each status on its own line
  const lines = tg.split('\n');
  assert.ok(lines.some(l => l.includes('draft: 1')));
  assert.ok(lines.some(l => l.includes('backlog: 1')));
  assert.ok(lines.some(l => l.includes('todo: 1')));
  assert.ok(lines.some(l => l.includes('Stale: 1')));
  // Zero statuses omitted
  assert.ok(!tg.includes('in-progress'));

  // Empty: only header line
  const empty = { total_open: 0, by_status: { draft: 0, backlog: 0, ready: 0, todo: 0, 'in-progress': 0, 'in-review': 0, rework: 0, done: 0, unlabeled: 0 }, stale_count: 0 };
  const tgEmpty = formatTelegramBrief('yaaf', empty);
  assert.strictEqual(tgEmpty.split('\n').filter(l => l.trim()).length, 1);
}

// ============================
// Unit: aggregate step
// ============================

function testAggregateStepReady() {
  console.log('Test: aggregate step — produces Ready result');
  const input = {
    project: { key: 'yaaf', repo: 'Kuzmin-Dmitry/yaaf', stale_after_days: 7 },
    issues: [
      { number: 1, title: 'A', labels: ['status:todo'], updated_at: '2026-04-01T12:00:00Z' },
      { number: 2, title: 'B', labels: ['status:in-progress'], updated_at: '2026-04-01T12:00:00Z' },
    ],
  };
  const result = aggregate(input, new Date('2026-04-02T12:00:00Z'));
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.project.key, 'yaaf');
  assert.strictEqual(result.stats.total_open, 2);
  assert.ok(result.brief.includes('Status: yaaf'));
  assert.ok(result.telegram_brief.includes('<b>Status: yaaf</b>'));
  assert.ok(result.generated_at);
}

function testAggregateStepEmpty() {
  console.log('Test: aggregate step — empty issues produce Ready with zeros');
  const input = {
    project: { key: 'yaaf', repo: 'Kuzmin-Dmitry/yaaf', stale_after_days: 7 },
    issues: [],
  };
  const result = aggregate(input, new Date('2026-04-02T12:00:00Z'));
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.stats.total_open, 0);
}

// ============================
// Integration: composed pipeline (step functions)
// ============================

async function testPipelineHappyPath() {
  console.log('Test: pipeline happy path — resolve → fetch → aggregate');
  const github = mockGitHub([[
    ghIssue(1, 'Fix auth flow', { labels: ['status:in-progress'] }),
    ghIssue(2, 'Add tests', { labels: ['status:todo'] }),
    ghIssue(3, 'Review API', { labels: ['status:in-review'] }),
    ghIssue(4, 'Bug report'),
  ]]);

  // Step 1: resolve
  const resolved = resolve('yaaf');
  assert.ok(resolved.project);

  // Step 2: fetch
  const [owner, repo] = resolved.project.repo.split('/');
  const issues = await fetchAllOpenIssues(github, owner, repo);
  const fetchResult = { project: resolved.project, issues };

  // Step 3: aggregate
  const result = aggregate(fetchResult, new Date('2026-04-02T12:00:00Z'));

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.project.key, 'yaaf');
  assert.strictEqual(result.stats.total_open, 4);
  assert.ok(result.brief.includes('Status: yaaf'));
}

async function testPipelineNeedInfo() {
  console.log('Test: pipeline NeedInfo — unknown alias short-circuits');
  const resolved = resolve('foobar');
  assert.strictEqual(resolved.type, 'NeedInfo');
  // In Lobster, NeedInfo flows through fetch and aggregate as pass-through
}

async function testPipelinePagination() {
  console.log('Test: pipeline — pagination flows through');
  const page1 = Array.from({ length: 100 }, (_, i) => ghIssue(i + 1, `Issue ${i + 1}`));
  const page2 = [ghIssue(101, 'Issue 101')];
  const github = mockGitHub([page1, page2]);

  const resolved = resolve('yaaf');
  const [owner, repo] = resolved.project.repo.split('/');
  const issues = await fetchAllOpenIssues(github, owner, repo);
  const result = aggregate({ project: resolved.project, issues }, new Date('2026-04-02T12:00:00Z'));

  assert.strictEqual(result.stats.total_open, 101);
}

// Run all
console.log('=== Project Status Tests ===');
(async () => {
  // Model: alias resolution
  testResolveKnown();
  testResolveCaseInsensitive();
  testResolveUnknown();
  testListKnown();

  // Step: resolve
  testResolveStepKnown();
  testResolveStepUnknown();
  testResolveStepNull();
  testResolveStepCaseInsensitive();

  // Step: fetch
  await testFetchFiltersPRs();
  await testFetchPaginates();
  await testFetchEmpty();
  await testFetchFailureThrows();

  // Model: aggregation
  testAggregateBasic();
  testAggregateStaleDetection();
  testAggregateUnknownStatusLabel();
  testAggregateDraftBacklogLabels();
  testAggregateMultipleStatusLabels();

  // Model: formatting
  testFormatBrief();
  testFormatBriefWithStale();
  testTelegramBriefFormat();

  // Step: aggregate
  testAggregateStepReady();
  testAggregateStepEmpty();

  // Integration: composed pipeline
  await testPipelineHappyPath();
  await testPipelineNeedInfo();
  await testPipelinePagination();

  console.log('All project status tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
