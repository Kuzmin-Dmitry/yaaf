/**
 * Tests for publish-task pipeline steps
 */

const assert = require('assert');
const { validateParams } = require('../../lobster/lib/tasks/steps/validate-publish-params');
const { formatIssueBody } = require('../../lobster/lib/tasks/steps/format-issue-body');
const { publishToGitHub } = require('../../lobster/lib/tasks/steps/publish-to-github');

// --- Step: Validate publish params ---

function testValidateHappy() {
  console.log('Test: validate passes with valid params');
  const result = validateParams({
    github_project: 'owner/repo',
    title: 'Fix login bug',
  });
  assert.strictEqual(result.valid, true);
}

function testValidateWithProjectNumber() {
  console.log('Test: validate passes with project number');
  const result = validateParams({
    github_project: 'owner/repo/3',
    title: 'Fix login bug',
  });
  assert.strictEqual(result.valid, true);
}

function testValidateMissingProject() {
  console.log('Test: validate rejects missing github_project');
  const result = validateParams({ title: 'Fix login bug' });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.result.type, 'Rejected');
  assert.strictEqual(result.result.reason, 'invalid_params');
  assert.ok(result.result.details.some((d) => d.includes('github_project')));
}

function testValidateInvalidProjectFormat() {
  console.log('Test: validate rejects invalid github_project format');
  const result = validateParams({
    github_project: 'just-a-name',
    title: 'Fix login bug',
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('format')));
}

function testValidateMissingTitle() {
  console.log('Test: validate rejects missing title');
  const result = validateParams({
    github_project: 'owner/repo',
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('title')));
}

function testValidateEmptyTitle() {
  console.log('Test: validate rejects empty title');
  const result = validateParams({
    github_project: 'owner/repo',
    title: '   ',
  });
  assert.strictEqual(result.valid, false);
}

function testValidateTitleTooLong() {
  console.log('Test: validate rejects title exceeding 300 chars');
  const result = validateParams({
    github_project: 'owner/repo',
    title: 'a'.repeat(301),
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('300')));
}

function testValidateDescriptionTooLong() {
  console.log('Test: validate rejects description exceeding 65536 chars');
  const result = validateParams({
    github_project: 'owner/repo',
    title: 'Test',
    description: 'a'.repeat(65537),
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('65536')));
}

function testValidateLabelsNotArray() {
  console.log('Test: validate rejects labels not an array');
  const result = validateParams({
    github_project: 'owner/repo',
    title: 'Test',
    labels: 'bug',
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('labels must be an array')));
}

function testValidateTooManyLabels() {
  console.log('Test: validate rejects labels exceeding 50');
  const result = validateParams({
    github_project: 'owner/repo',
    title: 'Test',
    labels: Array.from({ length: 51 }, (_, i) => `label-${i}`),
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('50')));
}

function testValidateTooManyAssignees() {
  console.log('Test: validate rejects assignees exceeding 10');
  const result = validateParams({
    github_project: 'owner/repo',
    title: 'Test',
    assignees: Array.from({ length: 11 }, (_, i) => `user-${i}`),
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.result.details.some((d) => d.includes('10')));
}

function testValidateFullParams() {
  console.log('Test: validate passes with all optional params');
  const result = validateParams({
    github_project: 'owner/repo/5',
    title: 'Add dark mode',
    description: 'Implement dark mode theme',
    labels: ['enhancement', 'ui'],
    assignees: ['alice', 'bob'],
    milestone: 'v1.5',
  });
  assert.strictEqual(result.valid, true);
}

// --- Step: Format issue body ---

function testFormatBodyWithDescription() {
  console.log('Test: format body includes description and metadata');
  const body = formatIssueBody(
    { description: 'Login page returns 500', source_id: 'YAAF-42' },
    { date: '2026-03-30' }
  );
  assert.ok(body.includes('Login page returns 500'));
  assert.ok(body.includes('yaaf'));
  assert.ok(body.includes('2026-03-30'));
  assert.ok(body.includes('YAAF-42'));
}

function testFormatBodyNoDescription() {
  console.log('Test: format body without description');
  const body = formatIssueBody({}, { date: '2026-03-30' });
  assert.ok(body.includes('yaaf'));
  assert.ok(body.includes('2026-03-30'));
  assert.ok(!body.includes('Source task'));
}

function testFormatBodyNoSourceId() {
  console.log('Test: format body without source_id');
  const body = formatIssueBody(
    { description: 'Some desc' },
    { date: '2026-03-30' }
  );
  assert.ok(!body.includes('Source task'));
}

// --- Step: Publish to GitHub ---

function mockGitHub(overrides = {}) {
  return {
    createIssue: async (_owner, _repo, opts) => ({
      number: 42,
      html_url: 'https://github.com/owner/repo/issues/42',
      title: opts.title,
      node_id: 'I_abc123',
    }),
    findMilestone: async () => 1,
    addToProject: async () => ({ data: { addProjectV2ItemById: { item: { id: 'PI_1' } } } }),
    ...overrides,
  };
}

async function testPublishHappy() {
  console.log('Test: publish creates issue and returns Ready');
  const result = await publishToGitHub(
    {
      github_project: 'owner/repo',
      title: 'Fix login bug',
      formatted_body: 'body text',
    },
    mockGitHub()
  );
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.issue.id, 42);
  assert.strictEqual(result.issue.title, 'Fix login bug');
  assert.ok(result.issue.url.includes('github.com'));
  assert.strictEqual(result.project, null);
}

async function testPublishWithProject() {
  console.log('Test: publish adds issue to project');
  const result = await publishToGitHub(
    {
      github_project: 'owner/repo/3',
      title: 'Fix login bug',
      formatted_body: 'body text',
    },
    mockGitHub()
  );
  assert.strictEqual(result.type, 'Ready');
  assert.deepStrictEqual(result.project, { added: true, projectNumber: 3 });
}

async function testPublishWithMilestone() {
  console.log('Test: publish resolves milestone');
  let capturedMilestone;
  const github = mockGitHub({
    createIssue: async (_owner, _repo, opts) => {
      capturedMilestone = opts.milestone;
      return { number: 42, html_url: 'https://github.com/owner/repo/issues/42', title: opts.title, node_id: 'I_abc' };
    },
    findMilestone: async () => 7,
  });
  const result = await publishToGitHub(
    {
      github_project: 'owner/repo',
      title: 'Test',
      formatted_body: 'body',
      milestone: 'v1.5',
    },
    github
  );
  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(capturedMilestone, 7);
}

async function testPublishMilestoneNotFound() {
  console.log('Test: publish rejects when milestone not found');
  const github = mockGitHub({ findMilestone: async () => null });
  const result = await publishToGitHub(
    {
      github_project: 'owner/repo',
      title: 'Test',
      formatted_body: 'body',
      milestone: 'v99',
    },
    github
  );
  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'milestone_not_found');
  assert.ok(result.details.includes('v99'));
}

async function testPublishAPIError() {
  console.log('Test: publish throws on API error (infra failure)');
  const github = mockGitHub({
    createIssue: async () => { throw new Error('GitHub API error: 503 Service Unavailable'); },
  });
  try {
    await publishToGitHub(
      { github_project: 'owner/repo', title: 'Test', formatted_body: 'body' },
      github
    );
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('503'));
  }
}

async function testPublishWithLabelsAndAssignees() {
  console.log('Test: publish passes labels and assignees');
  let capturedLabels, capturedAssignees;
  const github = mockGitHub({
    createIssue: async (_owner, _repo, opts) => {
      capturedLabels = opts.labels;
      capturedAssignees = opts.assignees;
      return { number: 42, html_url: 'https://github.com/owner/repo/issues/42', title: opts.title, node_id: 'I_abc' };
    },
  });
  await publishToGitHub(
    {
      github_project: 'owner/repo',
      title: 'Test',
      formatted_body: 'body',
      labels: ['bug', 'urgent'],
      assignees: ['alice'],
    },
    github
  );
  assert.deepStrictEqual(capturedLabels, ['bug', 'urgent']);
  assert.deepStrictEqual(capturedAssignees, ['alice']);
}

// Run all
console.log('=== Publish Task Steps Tests ===');
(async () => {
  // Validate
  testValidateHappy();
  testValidateWithProjectNumber();
  testValidateMissingProject();
  testValidateInvalidProjectFormat();
  testValidateMissingTitle();
  testValidateEmptyTitle();
  testValidateTitleTooLong();
  testValidateDescriptionTooLong();
  testValidateLabelsNotArray();
  testValidateTooManyLabels();
  testValidateTooManyAssignees();
  testValidateFullParams();
  // Format
  testFormatBodyWithDescription();
  testFormatBodyNoDescription();
  testFormatBodyNoSourceId();
  // Publish to GitHub
  await testPublishHappy();
  await testPublishWithProject();
  await testPublishWithMilestone();
  await testPublishMilestoneNotFound();
  await testPublishAPIError();
  await testPublishWithLabelsAndAssignees();

  console.log('All publish task step tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
