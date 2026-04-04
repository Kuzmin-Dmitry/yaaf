/**
 * Shared CLI I/O utilities for Lobster pipeline steps.
 *
 * Eliminates repeated stdin/passthrough/parseArg boilerplate.
 */

/**
 * Parse a CLI flag value from process.argv.
 * @param {string[]} args - process.argv
 * @param {string} flag - flag name (e.g. '--alias')
 * @returns {string}
 */
function parseArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] || '' : '';
}

/**
 * Read all stdin as a string.
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
  });
}

/**
 * Run a CLI step with stdin JSON piping and terminal-result pass-through.
 *
 * If stdin contains a terminal result (has a `type` field), it is passed
 * through to stdout without calling the handler.
 *
 * @param {Function} handler - async (input) => result
 */
async function runStdinStep(handler) {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw);

    // Pass-through terminal results (NeedInfo, NeedDecision, Rejected, Ready)
    if (input.type) {
      process.stdout.write(JSON.stringify(input) + '\n');
      return;
    }

    const result = await handler(input);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }
}

module.exports = { parseArg, runStdinStep };
