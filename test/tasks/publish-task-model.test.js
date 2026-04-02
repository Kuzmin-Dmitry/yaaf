/**
 * Tests for publish-task model — validation and parsing.
 */

const assert = require('assert');
const {
  validatePublishParams,
  parseGitHubProject,
  TITLE_MAX,
  DESCRIPTION_MAX,
  LABELS_MAX,
  ASSIGNEES_MAX,
} = require('../../lobster/lib/tasks/publish-task-model');

// --- validatePublishParams ---

function testValidMinimal() {
  console.log('Test: valid minimal params');
  const r = validatePublishParams({ github_project: 'owner/repo', title: 'Fix bug' });
  assert.strictEqual(r.valid, true);
}

function testValidFull() {
  console.log('Test: valid full params');
  const r = validatePublishParams({
    github_project: 'owner/repo/5',
    title: 'Fix bug',
    description: 'Details',
    labels: ['bug'],
    assignees: ['alice'],
    milestone: 'v1.0',
  });
  assert.strictEqual(r.valid, true);
}

function testMissingGithubProject() {
  console.log('Test: missing github_project');
  const r = validatePublishParams({ title: 'Fix bug' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors[0].includes('github_project'));
}

function testBadGithubProjectFormat() {
  console.log('Test: bad github_project format');
  const r = validatePublishParams({ github_project: 'noslash', title: 'Fix' });
  assert.strictEqual(r.valid, false);
}

function testMissingTitle() {
  console.log('Test: missing title');
  const r = validatePublishParams({ github_project: 'o/r' });
  assert.strictEqual(r.valid, false);
}

function testTitleTooLong() {
  console.log('Test: title too long');
  const r = validatePublishParams({ github_project: 'o/r', title: 'x'.repeat(TITLE_MAX + 1) });
  assert.strictEqual(r.valid, false);
}

function testDescriptionTooLong() {
  console.log('Test: description too long');
  const r = validatePublishParams({ github_project: 'o/r', title: 'Fix', description: 'x'.repeat(DESCRIPTION_MAX + 1) });
  assert.strictEqual(r.valid, false);
}

function testLabelsNotArray() {
  console.log('Test: labels not array');
  const r = validatePublishParams({ github_project: 'o/r', title: 'Fix', labels: 'bug' });
  assert.strictEqual(r.valid, false);
}

function testLabelsTooMany() {
  console.log('Test: too many labels');
  const r = validatePublishParams({ github_project: 'o/r', title: 'Fix', labels: Array(LABELS_MAX + 1).fill('x') });
  assert.strictEqual(r.valid, false);
}

function testAssigneesTooMany() {
  console.log('Test: too many assignees');
  const r = validatePublishParams({ github_project: 'o/r', title: 'Fix', assignees: Array(ASSIGNEES_MAX + 1).fill('u') });
  assert.strictEqual(r.valid, false);
}

function testMilestoneNotString() {
  console.log('Test: milestone not string');
  const r = validatePublishParams({ github_project: 'o/r', title: 'Fix', milestone: 123 });
  assert.strictEqual(r.valid, false);
}

function testMultipleErrors() {
  console.log('Test: multiple validation errors');
  const r = validatePublishParams({ labels: 'not-array' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.length >= 2); // github_project + title + labels
}

// --- parseGitHubProject ---

function testParseOwnerRepo() {
  console.log('Test: parse owner/repo');
  const p = parseGitHubProject('Kuzmin-Dmitry/yaaf');
  assert.strictEqual(p.owner, 'Kuzmin-Dmitry');
  assert.strictEqual(p.repo, 'yaaf');
  assert.strictEqual(p.projectNumber, null);
}

function testParseWithProjectNumber() {
  console.log('Test: parse owner/repo/3');
  const p = parseGitHubProject('org/project/3');
  assert.strictEqual(p.owner, 'org');
  assert.strictEqual(p.repo, 'project');
  assert.strictEqual(p.projectNumber, 3);
}

// Run all
console.log('=== Publish Task Model Tests ===');
testValidMinimal();
testValidFull();
testMissingGithubProject();
testBadGithubProjectFormat();
testMissingTitle();
testTitleTooLong();
testDescriptionTooLong();
testLabelsNotArray();
testLabelsTooMany();
testAssigneesTooMany();
testMilestoneNotString();
testMultipleErrors();
testParseOwnerRepo();
testParseWithProjectNumber();
console.log('All publish task model tests passed.');
