/**
 * Tests for approve_task pipeline — approval state transitions via GitHub labels.
 */

const assert = require('assert');
const { approveTask } = require('../../lobster/lib/tasks/approve-task');

// Helper: build mock tracker with approval support
function mockTracker(issueState = 'Draft', overrides = {}) {
  return {
    fetchIssue: async (id) => ({
      id: String(id),
      title: 'Fix login bug',
      state: issueState,
      labels: [],
    }),
    approveIssue: async (id) => ({
      id: String(id),
      title: 'Fix login bug',
      previousState: issueState,
      newState: issueState === 'Draft' ? 'Backlog' : 'Ready',
    }),
    ...overrides,
  };
}

// --- Happy path: Draft → Backlog ---

async function testApproveDraftToBacklog() {
  console.log('Test: Approve Draft → Backlog');
  const result = await approveTask(
    { issue_id: '10' },
    { tracker: mockTracker('Draft') }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, '10');
  assert.strictEqual(result.task.previousState, 'Draft');
  assert.strictEqual(result.task.newState, 'Backlog');
}

// --- Happy path: Backlog → Ready ---

async function testApproveBacklogToReady() {
  console.log('Test: Approve Backlog → Ready');
  const result = await approveTask(
    { issue_id: '20' },
    { tracker: mockTracker('Backlog') }
  );

  assert.strictEqual(result.type, 'Ready');
  assert.strictEqual(result.task.id, '20');
  assert.strictEqual(result.task.previousState, 'Backlog');
  assert.strictEqual(result.task.newState, 'Ready');
}

// --- Rejected: cannot approve Ready state ---

async function testApproveReadyRejected() {
  console.log('Test: Approve Ready → Rejected (no valid transition)');
  const result = await approveTask(
    { issue_id: '30' },
    { tracker: mockTracker('Ready') }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_transition');
  assert.ok(result.details.includes('Ready'));
}

// --- Rejected: cannot approve Done state ---

async function testApproveDoneRejected() {
  console.log('Test: Approve Done → Rejected');
  const result = await approveTask(
    { issue_id: '40' },
    { tracker: mockTracker('Done') }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_transition');
  assert.ok(result.details.includes('Done'));
}

// --- Rejected: cannot approve InProgress state ---

async function testApproveInProgressRejected() {
  console.log('Test: Approve InProgress → Rejected');
  const result = await approveTask(
    { issue_id: '50' },
    { tracker: mockTracker('InProgress') }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'invalid_transition');
}

// --- Missing issue_id ---

async function testMissingIssueId() {
  console.log('Test: Missing issue_id → Rejected');
  const result = await approveTask(
    { issue_id: undefined },
    { tracker: mockTracker() }
  );

  assert.strictEqual(result.type, 'Rejected');
  assert.strictEqual(result.reason, 'missing_issue_id');
}

// --- Tracker error (infra failure) ---

async function testTrackerFetchError() {
  console.log('Test: Tracker fetchIssue throws (infra failure)');
  const tracker = {
    fetchIssue: async () => { throw new Error('Connection refused'); },
    approveIssue: async () => { throw new Error('Should not be called'); },
  };

  try {
    await approveTask({ issue_id: '10' }, { tracker });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'Connection refused');
  }
}

async function testTrackerApproveError() {
  console.log('Test: Tracker approveIssue throws (infra failure)');
  const tracker = {
    fetchIssue: async () => ({ id: '10', title: 'Test', state: 'Draft', labels: [] }),
    approveIssue: async () => { throw new Error('API 503'); },
  };

  try {
    await approveTask({ issue_id: '10' }, { tracker });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.message, 'API 503');
  }
}

// --- Verify tracker methods are called with correct id ---

async function testTrackerCalledWithCorrectId() {
  console.log('Test: Tracker methods receive correct issue_id');
  let fetchedId, approvedId;
  const tracker = {
    fetchIssue: async (id) => {
      fetchedId = id;
      return { id, title: 'Test', state: 'Draft', labels: [] };
    },
    approveIssue: async (id) => {
      approvedId = id;
      return { id, title: 'Test', previousState: 'Draft', newState: 'Backlog' };
    },
  };

  await approveTask({ issue_id: '77' }, { tracker });
  assert.strictEqual(fetchedId, '77');
  assert.strictEqual(approvedId, '77');
}

// Run all
console.log('=== Approve Task Tests ===');
(async () => {
  await testApproveDraftToBacklog();
  await testApproveBacklogToReady();
  await testApproveReadyRejected();
  await testApproveDoneRejected();
  await testApproveInProgressRejected();
  await testMissingIssueId();
  await testTrackerFetchError();
  await testTrackerApproveError();
  await testTrackerCalledWithCorrectId();
  console.log('All approve task tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
