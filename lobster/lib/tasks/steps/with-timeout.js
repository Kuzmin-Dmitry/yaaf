/**
 * Shared timeout utility for pipeline steps.
 *
 * Wraps a promise with a timeout — rejects if the promise
 * doesn't settle within the given duration.
 */

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

module.exports = { withTimeout };
