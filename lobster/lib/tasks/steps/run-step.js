'use strict';

/**
 * Universal runner for Lobster steps to be called from YAML.
 * Usage: node lobster/lib/tasks/steps/run-step.js <step-name> <args-json>
 */

require('../../load-dotenv');
const fs = require('fs');
const path = require('path');

const stepName = process.argv[2];
const argsRaw = process.argv[3];
const useStdin = process.argv.includes('--stdin');

async function run() {
  if (!stepName) {
    console.error('Usage: node run-step.js <step-name> <args-json> [--stdin]');
    process.exit(1);
  }

  let args = {};
  try {
    if (argsRaw) {
      args = JSON.parse(argsRaw);
      // Recursively decode base64 values if they end with :base64
      const decodeB64 = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        for (const key in obj) {
          if (typeof obj[key] === 'string' && obj[key].endsWith(':base64')) {
            obj[key] = Buffer.from(obj[key].slice(0, -7), 'base64').toString('utf8');
          } else if (typeof obj[key] === 'object') {
            decodeB64(obj[key]);
          }
        }
        return obj;
      };
      decodeB64(args);
    }
  } catch (e) {
    console.error(`Failed to parse args JSON: ${e.message}`);
    process.exit(1);
  }

  // If --stdin is passed, read stdin and put it into args.stdin
  if (useStdin) {
    try {
      args.stdin = fs.readFileSync(0, 'utf8');
    } catch (e) {
      console.error(`Failed to read stdin: ${e.message}`);
      process.exit(1);
    }
  }

  const stepPath = path.join(__dirname, `${stepName}.js`);
  if (!fs.existsSync(stepPath)) {
    console.error(`Step not found: ${stepName} at ${stepPath}`);
    process.exit(1);
  }

  const stepModule = require(stepPath);
  const functionName = Object.keys(stepModule).find(k => typeof stepModule[k] === 'function');
  
  if (!functionName) {
    console.error(`No function exported in step: ${stepName}`);
    process.exit(1);
  }

  try {
    const result = await stepModule[functionName](args, process.env.GITHUB_TOKEN);
    
    if (result && result.type === 'Rejected') {
      console.error(result.reason || 'Step rejected');
      process.exit(1);
    }

    // Output result to stdout if it's not handled by the step itself
    if (result && result.docs) {
      process.stdout.write(result.docs);
    } else if (result && typeof result === 'object') {
      console.log(JSON.stringify(result));
    } else if (typeof result === 'string') {
      process.stdout.write(result);
    }
  } catch (e) {
    console.error(`Step execution failed: ${e.message}`);
    process.exit(1);
  }
}

run();
