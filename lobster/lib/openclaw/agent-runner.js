/**
 * OpenClaw Agent Runner
 *
 * Spawns an OpenClaw agent via CLI and returns the result.
 * Used by pipeline steps that delegate work to specialized agents.
 *
 * Requires `openclaw` CLI on PATH and gateway running (or --local mode).
 */

const { execFile } = require('child_process');

const DEFAULT_TIMEOUT_SEC = 120;

/**
 * Run an OpenClaw agent with a task message and return the response.
 *
 * @param {string} agentId - agent id (e.g. 'librarian')
 * @param {string} task - task message for the agent
 * @param {Object} [options]
 * @param {number} [options.timeoutSec=120] - agent timeout in seconds
 * @returns {Promise<string>} agent's text response
 */
function runAgent(agentId, task, options = {}) {
  const timeoutSec = options.timeoutSec ?? DEFAULT_TIMEOUT_SEC;

  return new Promise((resolve, reject) => {
    const args = [
      'agent',
      '--agent', agentId,
      '--message', task,
      '--local',
      '--timeout', String(timeoutSec),
    ];

    const execTimeout = (timeoutSec + 30) * 1000;

    execFile('openclaw', args, { timeout: execTimeout }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr ? `${err.message}: ${stderr.trim()}` : err.message;
        return reject(new Error(`Agent ${agentId} failed: ${msg}`));
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Run an OpenClaw agent and parse the JSON response.
 *
 * @param {string} agentId - agent id
 * @param {string} task - task message
 * @param {Object} [options]
 * @returns {Promise<Object>} parsed JSON response
 */
async function runAgentJSON(agentId, task, options = {}) {
  const raw = await runAgent(agentId, task, options);

  // Agent may wrap JSON in markdown code fences — strip them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Agent ${agentId} returned invalid JSON: ${err.message}\nRaw output: ${raw.slice(0, 500)}`);
  }
}

module.exports = { runAgent, runAgentJSON, DEFAULT_TIMEOUT_SEC };
