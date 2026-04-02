/**
 * GitHub module export
 */
const { createGitHubClient } = require('./client');
const { createGitHubTracker } = require('./tracker-adapter');
const { createSymphonyTrackerClient } = require('./symphony-adapter');
const { parseGitHubTrackerConfig } = require('./tracker-config');

module.exports = {
  createGitHubClient,
  createGitHubTracker,
  createSymphonyTrackerClient,
  parseGitHubTrackerConfig,
};
