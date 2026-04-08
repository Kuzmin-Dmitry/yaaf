'use strict';

const { spawn } = require('child_process');

const DISPATCH_TABLE = {
  'draft': 'lobster/workflows/issue-review.lobster',
  'reviewed_by_pm': 'lobster/workflows/get-user-approve.lobster',
  'needs_rework_after_pm': 'lobster/workflows/update-issue.lobster',
  'approved_after_pm': 'lobster/workflows/decompose-issue.lobster'
};

function dispatch(issue, project) {
  const workflow = DISPATCH_TABLE[issue.state];
  if (!workflow) {
    console.log(`[dispatcher] No workflow for state "${issue.state}" on #${issue.number}, skipping`);
    return Promise.resolve();
  }

  const args = JSON.stringify({
    issue_number: issue.number,
    owner: project.owner,
    repo: project.repo,
    issue_title: issue.title,
    issue_body: Buffer.from(issue.body || '').toString('base64') + ':base64'
  });

  console.log(`[dispatcher] #${issue.number} (${issue.state}) → ${workflow}`);
  console.log(`[dispatcher] #${issue.number} raw args length: ${args.length}`);

  return new Promise((resolve, reject) => {
    const child = spawn('lobster', ['run', workflow, '--args-json', args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', code => {
      if (code === 0) {
        console.log(`[dispatcher] #${issue.number} done: ${stdout.trim().slice(-200)}`);
        resolve();
      } else {
        const msg = `Workflow ${workflow} exited with code ${code}: ${stderr.trim().slice(-500)}`;
        console.error(`[dispatcher] #${issue.number} failed: ${msg}`);
        reject(new Error(msg));
      }
    });

    child.on('error', err => {
      reject(new Error(`Failed to spawn lobster: ${err.message}`));
    });
  });
}

module.exports = { dispatch, DISPATCH_TABLE };
