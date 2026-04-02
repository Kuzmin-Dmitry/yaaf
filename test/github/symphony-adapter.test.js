/**
 * Tests for Symphony GitHub Tracker Adapter.
 *
 * Covers:
 *   - Normalization helpers (extractStatusLabel, extractPriority, parseBlockedBy, normalizeIssue)
 *   - Three SPEC.md §11.1 operations (fetch_candidate_issues, fetch_issue_states_by_ids, fetch_issues_by_states)
 *   - Config parser (parseGitHubTrackerConfig, parseRepoString)
 */

const assert = require('assert');
const {
  createSymphonyTrackerClient,
  extractStatusLabel,
  extractPriority,
  parseBlockedBy,
  normalizeIssue,
} = require('../../lobster/lib/github/symphony-adapter');
const {
  parseGitHubTrackerConfig,
  parseRepoString,
  resolveEnvVar,
} = require('../../lobster/lib/github/tracker-config');

// ========================================================================
// Mock helpers
// ========================================================================

function makeIssueNode(overrides = {}) {
  return {
    id: 'I_node123',
    number: 42,
    title: 'Add OAuth support',
    body: 'Implement Google OAuth',
    url: 'https://github.com/acme/app/issues/42',
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T12:00:00Z',
    labels: { nodes: [{ name: 'status:todo' }, { name: 'priority:2' }, { name: 'enhancement' }] },
    linkedBranches: { nodes: [{ ref: { name: 'feat/oauth' } }] },
    ...overrides,
  };
}

function mockGraphQLClient(responses = {}) {
  const calls = [];
  return {
    calls,
    graphql: async (query, variables) => {
      calls.push({ query, variables });
      if (responses.error) throw responses.error;
      if (typeof responses.fn === 'function') return responses.fn(query, variables);
      return responses.result || { data: { repository: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } };
    },
  };
}

// ========================================================================
// extractStatusLabel
// ========================================================================

function testExtractStatusLabel_single() {
  console.log('Test: extractStatusLabel — single status label');
  const { state, warning } = extractStatusLabel(['status:todo', 'bug'], 'status');
  assert.strictEqual(state, 'todo');
  assert.strictEqual(warning, null);
}

function testExtractStatusLabel_multiple() {
  console.log('Test: extractStatusLabel — multiple status labels → first alphabetically + warning');
  const { state, warning } = extractStatusLabel(['status:in-progress', 'status:done'], 'status');
  assert.strictEqual(state, 'done'); // "done" < "in-progress" alphabetically
  assert.ok(warning.includes('Multiple'));
}

function testExtractStatusLabel_none() {
  console.log('Test: extractStatusLabel — no status label');
  const { state, warning } = extractStatusLabel(['bug', 'enhancement'], 'status');
  assert.strictEqual(state, null);
  assert.strictEqual(warning, null);
}

function testExtractStatusLabel_customPrefix() {
  console.log('Test: extractStatusLabel — custom prefix');
  const { state } = extractStatusLabel(['workflow:active', 'bug'], 'workflow');
  assert.strictEqual(state, 'active');
}

// ========================================================================
// extractPriority
// ========================================================================

function testExtractPriority_found() {
  console.log('Test: extractPriority — integer label');
  assert.strictEqual(extractPriority(['priority:2', 'bug']), 2);
}

function testExtractPriority_nonInteger() {
  console.log('Test: extractPriority — non-integer returns null');
  assert.strictEqual(extractPriority(['priority:urgent']), null);
}

function testExtractPriority_missing() {
  console.log('Test: extractPriority — no priority label');
  assert.strictEqual(extractPriority(['bug', 'enhancement']), null);
}

function testExtractPriority_firstWins() {
  console.log('Test: extractPriority — first integer priority wins');
  assert.strictEqual(extractPriority(['priority:3', 'priority:1']), 3);
}

// ========================================================================
// parseBlockedBy
// ========================================================================

function testParseBlockedBy_basic() {
  console.log('Test: parseBlockedBy — "blocked by #N"');
  const result = parseBlockedBy('This is blocked by #123', 'acme', 'app');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].identifier, 'acme/app#123');
  assert.strictEqual(result[0].id, null);
  assert.strictEqual(result[0].state, null);
}

function testParseBlockedBy_multiple() {
  console.log('Test: parseBlockedBy — multiple patterns');
  const body = 'blocked by #10, depends on #20, blocks: #30';
  const result = parseBlockedBy(body, 'o', 'r');
  assert.strictEqual(result.length, 3);
  assert.deepStrictEqual(result.map((r) => r.identifier), ['o/r#10', 'o/r#20', 'o/r#30']);
}

function testParseBlockedBy_dedup() {
  console.log('Test: parseBlockedBy — deduplicates');
  const body = 'blocked by #5 and also blocked by #5';
  const result = parseBlockedBy(body, 'o', 'r');
  assert.strictEqual(result.length, 1);
}

function testParseBlockedBy_null() {
  console.log('Test: parseBlockedBy — null body');
  assert.deepStrictEqual(parseBlockedBy(null, 'o', 'r'), []);
}

function testParseBlockedBy_noMatches() {
  console.log('Test: parseBlockedBy — no matches');
  assert.deepStrictEqual(parseBlockedBy('no dependencies here', 'o', 'r'), []);
}

// ========================================================================
// normalizeIssue
// ========================================================================

function testNormalizeIssue_full() {
  console.log('Test: normalizeIssue — full node');
  const node = makeIssueNode();
  const { issue, warning } = normalizeIssue(node, { owner: 'acme', repo: 'app', prefix: 'status' });

  assert.strictEqual(issue.id, 'I_node123');
  assert.strictEqual(issue.identifier, 'acme/app#42');
  assert.strictEqual(issue.title, 'Add OAuth support');
  assert.strictEqual(issue.description, 'Implement Google OAuth');
  assert.strictEqual(issue.priority, 2);
  assert.strictEqual(issue.state, 'todo');
  assert.strictEqual(issue.branch_name, 'feat/oauth');
  assert.strictEqual(issue.url, 'https://github.com/acme/app/issues/42');
  assert.deepStrictEqual(issue.labels, ['enhancement']);
  assert.deepStrictEqual(issue.blocked_by, []);
  assert.strictEqual(issue.created_at, '2026-04-01T10:00:00Z');
  assert.strictEqual(issue.updated_at, '2026-04-01T12:00:00Z');
  assert.strictEqual(warning, null);
}

function testNormalizeIssue_noLabels() {
  console.log('Test: normalizeIssue — no labels');
  const node = makeIssueNode({ labels: { nodes: [] } });
  const { issue } = normalizeIssue(node, { owner: 'o', repo: 'r', prefix: 'status' });
  assert.strictEqual(issue.state, null);
  assert.strictEqual(issue.priority, null);
  assert.deepStrictEqual(issue.labels, []);
}

function testNormalizeIssue_noBranch() {
  console.log('Test: normalizeIssue — no linked branch');
  const node = makeIssueNode({ linkedBranches: { nodes: [] } });
  const { issue } = normalizeIssue(node, { owner: 'o', repo: 'r', prefix: 'status' });
  assert.strictEqual(issue.branch_name, null);
}

function testNormalizeIssue_nullBody() {
  console.log('Test: normalizeIssue — null body');
  const node = makeIssueNode({ body: null });
  const { issue } = normalizeIssue(node, { owner: 'o', repo: 'r', prefix: 'status' });
  assert.strictEqual(issue.description, null);
  assert.deepStrictEqual(issue.blocked_by, []);
}

function testNormalizeIssue_blockedByInBody() {
  console.log('Test: normalizeIssue — blocked_by parsed from body');
  const node = makeIssueNode({ body: 'This depends on #99' });
  const { issue } = normalizeIssue(node, { owner: 'acme', repo: 'app', prefix: 'status' });
  assert.strictEqual(issue.blocked_by.length, 1);
  assert.strictEqual(issue.blocked_by[0].identifier, 'acme/app#99');
}

function testNormalizeIssue_metaLabelsFiltered() {
  console.log('Test: normalizeIssue — status/priority labels excluded from labels array');
  const node = makeIssueNode({
    labels: { nodes: [{ name: 'status:todo' }, { name: 'priority:1' }, { name: 'Bug' }, { name: 'Frontend' }] },
  });
  const { issue } = normalizeIssue(node, { owner: 'o', repo: 'r', prefix: 'status' });
  assert.deepStrictEqual(issue.labels, ['bug', 'frontend']);
}

// ========================================================================
// fetch_candidate_issues
// ========================================================================

async function testFetchCandidates_basic() {
  console.log('Test: fetch_candidate_issues — returns active issues only');
  const client = mockGraphQLClient({
    result: {
      data: {
        repository: {
          issues: {
            nodes: [
              makeIssueNode({ id: 'I_1', number: 1, labels: { nodes: [{ name: 'status:todo' }] } }),
              makeIssueNode({ id: 'I_2', number: 2, labels: { nodes: [{ name: 'status:done' }] } }),
              makeIssueNode({ id: 'I_3', number: 3, labels: { nodes: [{ name: 'bug' }] } }), // no status — skipped
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });

  const tracker = createSymphonyTrackerClient({
    owner: 'acme', repo: 'app',
    github: client,
  });

  const issues = await tracker.fetch_candidate_issues();
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].identifier, 'acme/app#1');
  assert.strictEqual(issues[0].state, 'todo');
}

async function testFetchCandidates_pagination() {
  console.log('Test: fetch_candidate_issues — paginates correctly');
  let callCount = 0;
  const client = mockGraphQLClient({
    fn: (_query, variables) => {
      callCount++;
      if (!variables.after) {
        return {
          data: {
            repository: {
              issues: {
                nodes: [makeIssueNode({ id: 'I_1', number: 1, labels: { nodes: [{ name: 'status:todo' }] } })],
                pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
              },
            },
          },
        };
      }
      return {
        data: {
          repository: {
            issues: {
              nodes: [makeIssueNode({ id: 'I_2', number: 2, labels: { nodes: [{ name: 'status:in-progress' }] } })],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      };
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const issues = await tracker.fetch_candidate_issues();
  assert.strictEqual(callCount, 2);
  assert.strictEqual(issues.length, 2);
}

async function testFetchCandidates_graphqlError() {
  console.log('Test: fetch_candidate_issues — throws on GraphQL errors');
  const client = mockGraphQLClient({
    result: { errors: [{ message: 'Bad request' }] },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  try {
    await tracker.fetch_candidate_issues();
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('GraphQL errors'));
  }
}

async function testFetchCandidates_customActiveStates() {
  console.log('Test: fetch_candidate_issues — respects custom active_states');
  const client = mockGraphQLClient({
    result: {
      data: {
        repository: {
          issues: {
            nodes: [
              makeIssueNode({ id: 'I_1', number: 1, labels: { nodes: [{ name: 'status:todo' }] } }),
              makeIssueNode({ id: 'I_2', number: 2, labels: { nodes: [{ name: 'status:rework' }] } }),
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });

  const tracker = createSymphonyTrackerClient({
    owner: 'o', repo: 'r', github: client,
    active_states: ['status:rework'],
  });

  const issues = await tracker.fetch_candidate_issues();
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].state, 'rework');
}

async function testFetchCandidates_warningOnMultipleLabels() {
  console.log('Test: fetch_candidate_issues — warns on multiple status labels');
  const warnings = [];
  const client = mockGraphQLClient({
    result: {
      data: {
        repository: {
          issues: {
            nodes: [
              makeIssueNode({
                id: 'I_1', number: 1,
                labels: { nodes: [{ name: 'status:todo' }, { name: 'status:in-progress' }] },
              }),
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });

  const tracker = createSymphonyTrackerClient({
    owner: 'o', repo: 'r', github: client,
    active_states: ['status:in-progress', 'status:todo'],
    onWarning: (msg) => warnings.push(msg),
  });

  const issues = await tracker.fetch_candidate_issues();
  assert.strictEqual(issues.length, 1);
  // "in-progress" < "todo" alphabetically, so state = "in-progress"
  assert.strictEqual(issues[0].state, 'in-progress');
  assert.strictEqual(warnings.length, 1);
  assert.ok(warnings[0].includes('Multiple'));
}

// ========================================================================
// fetch_issue_states_by_ids
// ========================================================================

async function testFetchStatesById_basic() {
  console.log('Test: fetch_issue_states_by_ids — returns state map');
  const client = mockGraphQLClient({
    result: {
      data: {
        nodes: [
          { id: 'I_1', state: 'OPEN', labels: { nodes: [{ name: 'status:in-progress' }] } },
          { id: 'I_2', state: 'CLOSED', labels: { nodes: [{ name: 'status:done' }] } },
        ],
      },
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const stateMap = await tracker.fetch_issue_states_by_ids(['I_1', 'I_2']);

  assert.strictEqual(stateMap.get('I_1'), 'in-progress');
  assert.strictEqual(stateMap.get('I_2'), 'done');
}

async function testFetchStatesById_closedNoLabel() {
  console.log('Test: fetch_issue_states_by_ids — CLOSED without status label → first terminal state');
  const client = mockGraphQLClient({
    result: {
      data: {
        nodes: [
          { id: 'I_1', state: 'CLOSED', labels: { nodes: [] } },
        ],
      },
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const stateMap = await tracker.fetch_issue_states_by_ids(['I_1']);
  assert.strictEqual(stateMap.get('I_1'), 'done');
}

async function testFetchStatesById_openNoLabel() {
  console.log('Test: fetch_issue_states_by_ids — OPEN without status label → skipped');
  const client = mockGraphQLClient({
    result: {
      data: {
        nodes: [
          { id: 'I_1', state: 'OPEN', labels: { nodes: [] } },
        ],
      },
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const stateMap = await tracker.fetch_issue_states_by_ids(['I_1']);
  assert.strictEqual(stateMap.has('I_1'), false);
}

async function testFetchStatesById_emptyIds() {
  console.log('Test: fetch_issue_states_by_ids — empty array returns empty map');
  const client = mockGraphQLClient();
  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const stateMap = await tracker.fetch_issue_states_by_ids([]);
  assert.strictEqual(stateMap.size, 0);
  assert.strictEqual(client.calls.length, 0); // no API call made
}

async function testFetchStatesById_nullNode() {
  console.log('Test: fetch_issue_states_by_ids — null nodes in response are skipped');
  const client = mockGraphQLClient({
    result: {
      data: {
        nodes: [
          null,
          { id: 'I_2', state: 'OPEN', labels: { nodes: [{ name: 'status:todo' }] } },
        ],
      },
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const stateMap = await tracker.fetch_issue_states_by_ids(['I_deleted', 'I_2']);
  assert.strictEqual(stateMap.size, 1);
  assert.strictEqual(stateMap.get('I_2'), 'todo');
}

// ========================================================================
// fetch_issues_by_states
// ========================================================================

async function testFetchByStates_basic() {
  console.log('Test: fetch_issues_by_states — returns terminal issues');
  const client = mockGraphQLClient({
    result: {
      data: {
        repository: {
          issues: {
            nodes: [
              makeIssueNode({ id: 'I_1', number: 1, labels: { nodes: [{ name: 'status:done' }] } }),
              makeIssueNode({ id: 'I_2', number: 2, labels: { nodes: [{ name: 'status:cancelled' }] } }),
              makeIssueNode({ id: 'I_3', number: 3, labels: { nodes: [{ name: 'status:in-progress' }] } }), // not terminal
              makeIssueNode({ id: 'I_4', number: 4, labels: { nodes: [] } }), // no status — skipped
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  const issues = await tracker.fetch_issues_by_states(['status:done', 'status:cancelled']);
  assert.strictEqual(issues.length, 2);
  assert.strictEqual(issues[0].state, 'done');
  assert.strictEqual(issues[1].state, 'cancelled');
}

async function testFetchByStates_usesDefaultTerminal() {
  console.log('Test: fetch_issues_by_states — uses default terminal_states when no arg');
  const client = mockGraphQLClient({
    result: {
      data: {
        repository: {
          issues: {
            nodes: [
              makeIssueNode({ id: 'I_1', number: 1, labels: { nodes: [{ name: 'status:done' }] } }),
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });

  const tracker = createSymphonyTrackerClient({
    owner: 'o', repo: 'r', github: client,
    terminal_states: ['status:done'],
  });
  // Call without argument — should use config defaults
  const issues = await tracker.fetch_issues_by_states();
  assert.strictEqual(issues.length, 1);
}

async function testFetchByStates_queriesClosedState() {
  console.log('Test: fetch_issues_by_states — queries CLOSED issues');
  const client = mockGraphQLClient({
    result: {
      data: {
        repository: {
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });

  const tracker = createSymphonyTrackerClient({ owner: 'o', repo: 'r', github: client });
  await tracker.fetch_issues_by_states(['status:done']);

  // Verify the query was called with CLOSED state
  assert.strictEqual(client.calls.length, 1);
  assert.deepStrictEqual(client.calls[0].variables.states, ['CLOSED']);
}

// ========================================================================
// parseRepoString
// ========================================================================

function testParseRepoString_valid() {
  console.log('Test: parseRepoString — valid "owner/repo"');
  const { owner, repo } = parseRepoString('Kuzmin-Dmitry/yaaf');
  assert.strictEqual(owner, 'Kuzmin-Dmitry');
  assert.strictEqual(repo, 'yaaf');
}

function testParseRepoString_invalid() {
  console.log('Test: parseRepoString — invalid format throws');
  assert.throws(() => parseRepoString('noslash'), /Invalid tracker.repo format/);
  assert.throws(() => parseRepoString('too/many/slashes'), /Invalid tracker.repo format/);
  assert.throws(() => parseRepoString(''), /required/);
  assert.throws(() => parseRepoString(null), /required/);
}

// ========================================================================
// resolveEnvVar
// ========================================================================

function testResolveEnvVar() {
  console.log('Test: resolveEnvVar — resolves $VAR from env');
  process.env.__TEST_TOKEN_42__ = 'secret123';
  assert.strictEqual(resolveEnvVar('$__TEST_TOKEN_42__'), 'secret123');
  assert.strictEqual(resolveEnvVar('literal-value'), 'literal-value');
  assert.strictEqual(resolveEnvVar('$__NONEXISTENT_VAR_42__'), undefined);
  delete process.env.__TEST_TOKEN_42__;
}

// ========================================================================
// parseGitHubTrackerConfig
// ========================================================================

function testParseConfig_valid() {
  console.log('Test: parseGitHubTrackerConfig — valid config');
  process.env.__TEST_GH_TOKEN__ = 'ghp_test';
  const config = parseGitHubTrackerConfig({
    kind: 'github',
    repo: 'acme/app',
    api_key: '$__TEST_GH_TOKEN__',
    active_states: ['status:todo', 'status:rework'],
    terminal_states: ['status:done'],
    label_prefix: 'workflow',
  });

  assert.strictEqual(config.owner, 'acme');
  assert.strictEqual(config.repo, 'app');
  assert.strictEqual(config.token, 'ghp_test');
  assert.strictEqual(config.label_prefix, 'workflow');
  assert.deepStrictEqual(config.active_states, ['status:todo', 'status:rework']);
  assert.deepStrictEqual(config.terminal_states, ['status:done']);
  delete process.env.__TEST_GH_TOKEN__;
}

function testParseConfig_missingKind() {
  console.log('Test: parseGitHubTrackerConfig — wrong kind throws');
  assert.throws(() => parseGitHubTrackerConfig({ kind: 'linear', repo: 'o/r', api_key: 'tok' }), /must be "github"/);
}

function testParseConfig_missingToken() {
  console.log('Test: parseGitHubTrackerConfig — missing token throws');
  const saved = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  assert.throws(
    () => parseGitHubTrackerConfig({ kind: 'github', repo: 'o/r', api_key: '$__NONEXISTENT__' }),
    /not configured/
  );
  if (saved) process.env.GITHUB_TOKEN = saved;
}

function testParseConfig_invalidStates() {
  console.log('Test: parseGitHubTrackerConfig — non-array states throws');
  assert.throws(
    () => parseGitHubTrackerConfig({ kind: 'github', repo: 'o/r', api_key: 'tok', active_states: 'not-array' }),
    /must be an array/
  );
}

function testParseConfig_minimalDefaults() {
  console.log('Test: parseGitHubTrackerConfig — minimal config uses defaults');
  const config = parseGitHubTrackerConfig({
    kind: 'github',
    repo: 'o/r',
    api_key: 'ghp_direct_token',
  });

  assert.strictEqual(config.owner, 'o');
  assert.strictEqual(config.repo, 'r');
  assert.strictEqual(config.token, 'ghp_direct_token');
  assert.strictEqual(config.label_prefix, undefined); // adapter uses its own defaults
  assert.strictEqual(config.active_states, undefined);
}

// ========================================================================
// Factory validation
// ========================================================================

function testFactory_missingOwner() {
  console.log('Test: createSymphonyTrackerClient — missing owner throws');
  assert.throws(() => createSymphonyTrackerClient({ repo: 'r', github: {} }), /owner and repo are required/);
}

function testFactory_missingRepo() {
  console.log('Test: createSymphonyTrackerClient — missing repo throws');
  assert.throws(() => createSymphonyTrackerClient({ owner: 'o', github: {} }), /owner and repo are required/);
}

// ========================================================================
// Run all
// ========================================================================

console.log('=== Symphony Adapter Tests ===');
(async () => {
  // Normalization
  testExtractStatusLabel_single();
  testExtractStatusLabel_multiple();
  testExtractStatusLabel_none();
  testExtractStatusLabel_customPrefix();
  testExtractPriority_found();
  testExtractPriority_nonInteger();
  testExtractPriority_missing();
  testExtractPriority_firstWins();
  testParseBlockedBy_basic();
  testParseBlockedBy_multiple();
  testParseBlockedBy_dedup();
  testParseBlockedBy_null();
  testParseBlockedBy_noMatches();
  testNormalizeIssue_full();
  testNormalizeIssue_noLabels();
  testNormalizeIssue_noBranch();
  testNormalizeIssue_nullBody();
  testNormalizeIssue_blockedByInBody();
  testNormalizeIssue_metaLabelsFiltered();

  // fetch_candidate_issues
  await testFetchCandidates_basic();
  await testFetchCandidates_pagination();
  await testFetchCandidates_graphqlError();
  await testFetchCandidates_customActiveStates();
  await testFetchCandidates_warningOnMultipleLabels();

  // fetch_issue_states_by_ids
  await testFetchStatesById_basic();
  await testFetchStatesById_closedNoLabel();
  await testFetchStatesById_openNoLabel();
  await testFetchStatesById_emptyIds();
  await testFetchStatesById_nullNode();

  // fetch_issues_by_states
  await testFetchByStates_basic();
  await testFetchByStates_usesDefaultTerminal();
  await testFetchByStates_queriesClosedState();

  // Config parser
  testParseRepoString_valid();
  testParseRepoString_invalid();
  testResolveEnvVar();
  testParseConfig_valid();
  testParseConfig_missingKind();
  testParseConfig_missingToken();
  testParseConfig_invalidStates();
  testParseConfig_minimalDefaults();

  // Factory validation
  testFactory_missingOwner();
  testFactory_missingRepo();

  console.log('All Symphony adapter tests passed.');
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
