/**
 * Tests for review_task pipeline — end-to-end scenarios.
 */

const assert = require('assert');
const { reviewTask } = require('../../lobster/lib/tasks/review-task');

// Helper: build mock tracker
function mockTracker(issueOverrides = {}, updateResult = {}) {
  return {
    fetchIssue: async (id) => ({
      id: String(id),
      title: 'Fix login bug',
      body: 'Login page returns 500 on invalid email',
      state: 'Draft',
      labels: [],
      ...issueOverrides,
    }),
    updateIssue: async (id, updates) => ({
      id: String(id),
      title: 'Fix login bug',
      url: `https://github.com/org/repo/issues/${id}`,
      ...updateResult,
    }),
  };
}

// Helper: build mock agent runner (replaces mock GitHub client)
function mockAgentRunner(contextOverrides = {}) {
  return {
    runAgentJSON: async () => ({
      repoTree: ['package.json', 'src/auth/login.js', 'docs/architecture.md'],
      files: [
        { path: 'package.json', content: '{ "name": "test" }' },
        { path: 'src/auth/login.js', content: 'module.exports = { login() {} }' },
        { path: 'docs/architecture.md', content: '# Architecture\nOverview...' },
      ],
      totalSize: 120,
      ...contextOverrides,
    }),
  };
}

// Helper: build mock LLM
function mockLLM(analyzeResult = {}, rewriteResult = {}) {
  return {
    analyzeTask: async () => ({
      affected_components: ['src/auth/login.js'],
      technical_gaps: [],
      risks: ['No input validation'],
      dependencies: [],
      suggested_approach: 'Add email validation before login attempt',
      completeness_score: 4,
      ...analyzeResult,
    }),
    rewriteTask: async () => ({
      title: 'Fix login bug',
      body: '## Summary\nFix login 500 error on invalid email\n\n## Technical Context\n...\n\n<details><summary>Original Description</summary>\nLogin page returns 500 on invalid email\n</details>',
      ...rewriteResult,
    }),
  };
}

function defaultDeps(overrides = {}) {
  return {
    tracker: mockTracker(),
    llm: mockLLM(),
    agentRunner: mockAgentRunner(),
    owner: 'org',
    repo: 'repo',
    ...overrides,
  };
}

// --- Happy path: full pipeline → NeedDecision ---

async function testHappyPathReturnsNeedDecision() {
  console.log('Test: Happy path — first invocation returns NeedDecision');
  const result = await reviewTask(
    { issue_id: '42', partial_state: null },
    defaultDeps()
  );

  assert.strictEqual(result.type, 'NeedDecision');
  assert.strictEqual(result.phase, 'approval');
  assert.ok(result.rewritten_task);
  assert.ok(result.options.includes('approve'));
  assert.ok(result.options.includes('edit'));
  assert.ok(result.options.includes('reject'));
  assert.ok(result.partial_state);
  assert.ok(result.partial_state.issue);
  assert.ok(result.partial_state.analysis);
  assert.ok(result.partial_state.rewritten);
}

// --- Approval: approve → Ready ---

async function testApproveReturnsReady() {
  console.log('Test: Approve decision → Ready');
  const rewritten = { title: 'Fix login bug', body: '## Summary\nRewritten...' };
  const result = await reviewTask(
    {
      issue_id: '42',
      partial_state: {
        decision: 'approve',
        rewritten,
      },
    },
    defaultDeps()
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, '42');
  assert.ok(result.task.url);
  assert.ok(result.task.changes_summary);
}

// --- Rejection: user rejects → Rejected ---

async function testRejectReturnsRejected() {
  console.log('Test: Reject decision → Rejected');
  const result = await reviewTask(
    {
      issue_id: '42',
      partial_state: { decision: 'reject' },
    },
    defaultDeps()
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'user_rejected');
}

// --- NeedInfo: analysis has gaps → NeedInfo ---

async function testAnalysisGapsReturnNeedInfo() {
  console.log('Test: Analysis with gaps → NeedInfo');
  const llm = mockLLM({
    technical_gaps: ['Which authentication provider is used?', 'Is there a rate limiter?'],
  });

  const result = await reviewTask(
    { issue_id: '42', partial_state: null },
    defaultDeps({ llm })
  );

  assert.strictEqual(result.type, 'NeedInfo');
  assert.strictEqual(result.phase, 'analysis');
  assert.strictEqual(result.questions.length, 2);
  assert.ok(result.partial_state);
  assert.strictEqual(result.partial_state.clarification_count, 1);
}

// --- Edit feedback: re-invoke with edit_notes ---

async function testEditNotesReInvokesRewrite() {
  console.log('Test: Edit notes triggers rewrite and returns NeedDecision');
  const issue = { id: '42', title: 'Fix login bug', body: 'Original body', state: 'Draft', labels: [] };
  const analysis = {
    affected_components: ['src/auth/login.js'],
    technical_gaps: [],
    risks: [],
    dependencies: [],
    suggested_approach: 'Add validation',
    completeness_score: 5,
  };
  const codeContext = { repoTree: [], files: [], totalSize: 0 };

  const result = await reviewTask(
    {
      issue_id: '42',
      partial_state: {
        edit_notes: 'Please add more detail about error handling',
        analysis,
        issue,
        code_context: codeContext,
        edit_count: 0,
      },
    },
    defaultDeps()
  );

  assert.strictEqual(result.type, 'NeedDecision');
  assert.strictEqual(result.phase, 'approval');
  assert.strictEqual(result.partial_state.edit_count, 1);
}

// --- Max edit rounds exceeded → Rejected ---

async function testMaxEditRoundsRejected() {
  console.log('Test: Max edit rounds exceeded → Rejected');
  const issue = { id: '42', title: 'Fix login bug', body: 'Original', state: 'Draft', labels: [] };
  const analysis = { affected_components: [], technical_gaps: [], risks: [], dependencies: [], suggested_approach: '', completeness_score: 5 };
  const codeContext = { repoTree: [], files: [], totalSize: 0 };

  const result = await reviewTask(
    {
      issue_id: '42',
      partial_state: {
        edit_notes: 'More changes',
        analysis,
        issue,
        code_context: codeContext,
        edit_count: 2, // already at limit
      },
    },
    defaultDeps()
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'max_retries');
}

// --- Max analysis clarification rounds → Rejected ---

async function testMaxAnalysisClarificationsRejected() {
  console.log('Test: Max analysis clarifications → Rejected');
  const llm = mockLLM({ technical_gaps: ['Still have questions'] });

  const result = await reviewTask(
    {
      issue_id: '42',
      partial_state: { clarification_count: 3 }, // already at limit
    },
    defaultDeps({ llm })
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'max_retries');
}

// --- Invalid state: Ready → Rejected ---

async function testInvalidStateRejected() {
  console.log('Test: Issue in Ready state → Rejected');
  const tracker = mockTracker({ state: 'Ready' });

  const result = await reviewTask(
    { issue_id: '42', partial_state: null },
    defaultDeps({ tracker })
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_state');
  assert.ok(result.details.includes('Ready'));
}

// --- Invalid state: Done → Rejected ---

async function testDoneStateRejected() {
  console.log('Test: Issue in Done state → Rejected');
  const tracker = mockTracker({ state: 'Done' });

  const result = await reviewTask(
    { issue_id: '42', partial_state: null },
    defaultDeps({ tracker })
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_state');
}

// --- Missing issue_id → Rejected ---

async function testMissingIssueId() {
  console.log('Test: Missing issue_id → Rejected');
  const result = await reviewTask(
    { issue_id: undefined, partial_state: null },
    defaultDeps()
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'missing_issue_id');
}

// --- Tracker fetch error → throws (infra failure) ---

async function testTrackerFetchThrows() {
  console.log('Test: Tracker fetchIssue throws → infra failure');
  const tracker = {
    fetchIssue: async () => { throw new Error('Connection refused'); },
    updateIssue: async () => { throw new Error('Should not be called'); },
  };

  try {
    await reviewTask({ issue_id: '42', partial_state: null }, defaultDeps({ tracker }));
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'Connection refused');
  }
}

// --- Backlog state is reviewable ---

async function testBacklogStateAllowed() {
  console.log('Test: Issue in Backlog state → proceeds (NeedDecision)');
  const tracker = mockTracker({ state: 'Backlog' });

  const result = await reviewTask(
    { issue_id: '42', partial_state: null },
    defaultDeps({ tracker })
  );

  assert.strictEqual(result.type, 'NeedDecision');
}

// --- Agent runner failure → throws (infra failure) ---

async function testAgentRunnerFailureThrows() {
  console.log('Test: Agent runner failure → infra failure');
  const agentRunner = {
    runAgentJSON: async () => { throw new Error('Agent timeout'); },
  };

  try {
    await reviewTask({ issue_id: '42', partial_state: null }, defaultDeps({ agentRunner }));
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Agent timeout'));
  }
}

// --- Agent returns error field → throws ---

async function testAgentErrorFieldThrows() {
  console.log('Test: Agent returns error field → throws');
  const agentRunner = mockAgentRunner({ error: 'Cannot access repository' });
  // Clear files/repoTree so only error is present
  agentRunner.runAgentJSON = async () => ({ error: 'Cannot access repository' });

  try {
    await reviewTask({ issue_id: '42', partial_state: null }, defaultDeps({ agentRunner }));
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Cannot access repository'));
  }
}

// --- Verify tracker.updateIssue called with correct params on approve ---

async function testUpdateIssueCalledCorrectly() {
  console.log('Test: updateIssue receives correct issue_id and body');
  let calledId, calledUpdates;
  const tracker = {
    fetchIssue: async () => ({ id: '42', title: 'Test', body: 'Body', state: 'Draft', labels: [] }),
    updateIssue: async (id, updates) => {
      calledId = id;
      calledUpdates = updates;
      return { id, title: 'Test', url: 'https://github.com/org/repo/issues/42' };
    },
  };

  const rewritten = { title: 'Test', body: '## Rewritten body' };
  await reviewTask(
    {
      issue_id: '42',
      partial_state: { decision: 'approve', rewritten },
    },
    defaultDeps({ tracker })
  );

  assert.strictEqual(calledId, '42');
  assert.strictEqual(calledUpdates.body, '## Rewritten body');
  assert.ok(calledUpdates.addLabels.includes('reviewed:architecture'));
}

// Run all
console.log('=== Review Task Tests ===');
(async () => {
  await testHappyPathReturnsNeedDecision();
  await testApproveReturnsReady();
  await testRejectReturnsRejected();
  await testAnalysisGapsReturnNeedInfo();
  await testEditNotesReInvokesRewrite();
  await testMaxEditRoundsRejected();
  await testMaxAnalysisClarificationsRejected();
  await testInvalidStateRejected();
  await testDoneStateRejected();
  await testMissingIssueId();
  await testTrackerFetchThrows();
  await testBacklogStateAllowed();
  await testAgentRunnerFailureThrows();
  await testAgentErrorFieldThrows();
  await testUpdateIssueCalledCorrectly();
  console.log('All review task tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
