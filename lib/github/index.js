/**
 * GitHub module export
 */
const { createGitHubClient } = require('./client');
const { createGitHubTracker } = require('./tracker-adapter');

module.exports = {
  createGitHubClient,
  createGitHubTracker,
};
