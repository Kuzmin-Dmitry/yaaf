/**
 * Tests for publish_task pipeline — end-to-end scenarios.
 */

const assert = require('assert');
const { publishTask } = require('../../lib/tasks/publish-task');

// Helper: build mock GitHub client
function mockGitHub(overrides = {}) {
  return {
    createIssue: async (_owner, _repo, opts) => ({
      number: 42,
      html_url: `https://github.com/${_owner}/${_repo}/issues/42`,
      title: opts.title,
      node_id: 'I_kwDOAbc123',
    }),
    findMilestone: async () => 1,
    addToProject: async () => ({ data: { addProjectV2ItemById: { item: { id: 'PI_1' } } } }),
    ...overrides,
  };
}

// --- Scenario: Simple issue creation ---

async function testSimpleIssue() {
  console.log('Test: Simple issue — title + description');
  const result = await publishTask(
    {
      github_project: 'owner/repo',
      title: 'Fix login button styling',
      description: 'The login button on mobile devices is cut off',
    },
    { github: mockGitHub() }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.issue.id, 42);
  assert.strictEqual(result.issue.title, 'Fix login button styling');
  assert.ok(result.issue.url.includes('github.com'));
  assert.strictEqual(result.project, null);
}

// --- Scenario: Issue with labels and assignees ---

async function testIssueWithLabelsAndAssignees() {
  console.log('Test: Issue with labels and assignees');
  let capturedOpts;
  const github = mockGitHub({
    createIssue: async (_owner, _repo, opts) => {
      capturedOpts = opts;
      return { number: 43, html_url: 'https://github.com/owner/repo/issues/43', title: opts.title, node_id: 'I_abc' };
    },
  });
  const result = await publishTask(
    {
      github_project: 'owner/repo',
      title: 'Add dark mode support',
      description: 'Implement dark mode theme for the app',
      labels: ['enhancement', 'ui'],
      assignees: ['alice', 'bob'],
    },
    { github }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.issue.id, 43);
  assert.deepStrictEqual(capturedOpts.labels, ['enhancement', 'ui']);
  assert.deepStrictEqual(capturedOpts.assignees, ['alice', 'bob']);
}

// --- Scenario: Issue in GitHub Project ---

async function testIssueWithProject() {
  console.log('Test: Issue added to GitHub Project');
  let addToProjectCalled = false;
  const github = mockGitHub({
    addToProject: async (projectNumber, _owner, _nodeId) => {
      addToProjectCalled = true;
      assert.strictEqual(projectNumber, 3);
      return { data: { addProjectV2ItemById: { item: { id: 'PI_2' } } } };
    },
  });
  const result = await publishTask(
    {
      github_project: 'owner/repo/3',
      title: 'Performance optimization',
      milestone: 'v1.5',
    },
    { github }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(addToProjectCalled, true);
  assert.deepStrictEqual(result.project, { added: true, projectNumber: 3 });
}

// --- Scenario: Milestone resolution ---

async function testMilestoneResolved() {
  console.log('Test: Milestone resolved to number');
  let capturedMilestone;
  const github = mockGitHub({
    findMilestone: async (_owner, _repo, name) => {
      assert.strictEqual(name, 'v1.5');
      return 7;
    },
    createIssue: async (_owner, _repo, opts) => {
      capturedMilestone = opts.milestone;
      return { number: 44, html_url: 'https://github.com/owner/repo/issues/44', title: opts.title, node_id: 'I_abc' };
    },
  });
  const result = await publishTask(
    {
      github_project: 'owner/repo',
      title: 'Test',
      milestone: 'v1.5',
    },
    { github }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(capturedMilestone, 7);
}

async function testMilestoneNotFound() {
  console.log('Test: Milestone not found — Rejected');
  const github = mockGitHub({ findMilestone: async () => null });
  const result = await publishTask(
    {
      github_project: 'owner/repo',
      title: 'Test',
      milestone: 'v99',
    },
    { github }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'milestone_not_found');
  assert.ok(result.details.includes('v99'));
}

// --- Scenario: Validation failures ---

async function testRejectedMissingProject() {
  console.log('Test: Rejected — missing github_project');
  const result = await publishTask(
    { title: 'Fix bug' },
    { github: mockGitHub() }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_params');
}

async function testRejectedMissingTitle() {
  console.log('Test: Rejected — missing title');
  const result = await publishTask(
    { github_project: 'owner/repo' },
    { github: mockGitHub() }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_params');
}

async function testRejectedInvalidFormat() {
  console.log('Test: Rejected — invalid github_project format');
  const result = await publishTask(
    { github_project: 'bad-format', title: 'Test' },
    { github: mockGitHub() }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.ok(result.details.some((d) => d.includes('format')));
}

// --- Scenario: Dry run ---

async function testDryRun() {
  console.log('Test: Dry run — no API calls, returns preview');
  let apiCalled = false;
  const github = mockGitHub({
    createIssue: async () => { apiCalled = true; return {}; },
  });
  const result = await publishTask(
    {
      github_project: 'owner/repo',
      title: 'Test dry run',
      description: 'Checking preview',
      labels: ['test'],
      dry_run: true,
    },
    { github }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.dry_run, true);
  assert.strictEqual(apiCalled, false);
  assert.strictEqual(result.would_create.title, 'Test dry run');
  assert.deepStrictEqual(result.would_create.labels, ['test']);
  assert.ok(result.would_create.body.includes('yaaf'));
}

// --- Scenario: Infra failures ---

async function testAPIError() {
  console.log('Test: API error — throws (infra failure)');
  const github = mockGitHub({
    createIssue: async () => { throw new Error('GitHub API error: 503 Service Unavailable'); },
  });
  try {
    await publishTask(
      { github_project: 'owner/repo', title: 'Test' },
      { github }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('503'));
  }
}

async function testRepoNotFound() {
  console.log('Test: Repo not found — throws 404');
  const github = mockGitHub({
    createIssue: async () => {
      const err = new Error('GitHub API error: 404 Not Found');
      err.status = 404;
      throw err;
    },
  });
  try {
    await publishTask(
      { github_project: 'owner/nonexistent', title: 'Test' },
      { github }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.status, 404);
  }
}

async function testProjectNotFound() {
  console.log('Test: Project not found — throws');
  const github = mockGitHub({
    addToProject: async () => { throw new Error('GitHub Project #99 not found for owner'); },
  });
  try {
    await publishTask(
      { github_project: 'owner/repo/99', title: 'Test' },
      { github }
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Project #99'));
  }
}

// --- Scenario: Body formatting ---

async function testBodyIncludesMetadata() {
  console.log('Test: Issue body includes yaaf metadata');
  let capturedBody;
  const github = mockGitHub({
    createIssue: async (_owner, _repo, opts) => {
      capturedBody = opts.body;
      return { number: 45, html_url: 'https://github.com/o/r/issues/45', title: opts.title, node_id: 'I_abc' };
    },
  });
  await publishTask(
    {
      github_project: 'owner/repo',
      title: 'Test',
      description: 'Some **markdown** description',
      source_id: 'YAAF-17',
    },
    { github }
  );

  assert.ok(capturedBody.includes('Some **markdown** description'));
  assert.ok(capturedBody.includes('yaaf'));
  assert.ok(capturedBody.includes('YAAF-17'));
}

// Run all
console.log('=== Publish Task Pipeline Tests ===');
(async () => {
  await testSimpleIssue();
  await testIssueWithLabelsAndAssignees();
  await testIssueWithProject();
  await testMilestoneResolved();
  await testMilestoneNotFound();
  await testRejectedMissingProject();
  await testRejectedMissingTitle();
  await testRejectedInvalidFormat();
  await testDryRun();
  await testAPIError();
  await testRepoNotFound();
  await testProjectNotFound();
  await testBodyIncludesMetadata();
  console.log('All publish task pipeline tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
