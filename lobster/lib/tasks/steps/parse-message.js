'use strict';

const { llmTask } = require('./llm-task');

function buildPrompt(message) {
  return [
    'You are a senior product manager and project parser for a software delivery conveyor.',
    'Given the raw user message below, perform the following tasks:',
    '1. Extract project_alias (lowercase, latin, one word).',
    '2. Create issue_title: a concise, professional summary (English or Russian).',
    '3. Create issue_body: reformat the message into a professional GitHub issue using this template:',
    '',
    '## Context',
    '(What is the background of this request?)',
    '',
    '## Objective',
    '(What is the specific goal to be achieved?)',
    '',
    '## Requirements / Proposed Solution',
    '(Details of what needs to be implemented or changed)',
    '',
    '## Acceptance Criteria',
    '- [ ] (Criterion 1)',
    '- [ ] (Criterion 2)',
    '',
    'Return ONLY valid JSON: {"project_alias": "...", "issue_title": "...", "issue_body": "..."}',
    '',
    'Message: ' + message
  ].join('\n');
}

function stripFences(raw) {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1].trim() : raw;
}

function validateFields(obj) {
  const missing = [];
  if (typeof obj.project_alias !== 'string' || !obj.project_alias) missing.push('project_alias');
  if (typeof obj.issue_title !== 'string' || !obj.issue_title) missing.push('issue_title');
  if (typeof obj.issue_body !== 'string' || !obj.issue_body) missing.push('issue_body');
  return missing;
}

async function parseMessage(message) {
  const prompt = buildPrompt(message);
  const raw = await llmTask(prompt);
  const json = stripFences(raw.trim());

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('parse: invalid JSON — ' + e.message + '\nraw: ' + raw.slice(0, 500));
  }

  const missing = validateFields(parsed);
  if (missing.length) {
    throw new Error('parse: missing fields — ' + missing.join(', '));
  }

  return parsed;
}

module.exports = { parseMessage, buildPrompt, stripFences, validateFields };

if (require.main === module) {
  require('../../load-dotenv');
  const message = process.env.MESSAGE;
  if (!message) { console.error('MESSAGE env is required'); process.exit(1); }
  parseMessage(message)
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => { console.error(e.message); process.exit(1); });
}
