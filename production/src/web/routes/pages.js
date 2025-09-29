/**
 * QuestCord Web Page Routes
 * =========================
 * Handles routing for the QuestCord landing page and essential web pages.
 *
 * **Available Pages:**
 * - Landing page (main application interface)
 * - Terms of Service and Privacy Policy (legal compliance)
 * - Status page (service health monitoring)
 *
 * **Features:**
 * - Subdomain routing for status page
 * - Single Page Application (SPA) support
 * - Static HTML file serving
 */

// Import Express framework for creating web page routes
const express = require('express');
// Import path utilities for constructing file paths
const path = require('path');
// Create Express router instance for mounting page routes
const router = express.Router();

/**
 * Terms of Service Page
 * GET /terms
 * Serves the Terms of Service HTML page for legal compliance
 * Required for user agreement and service usage policies
 */
router.get('/terms', (req, res) => {
  // Serve the static terms.html file from the web/public directory
  res.sendFile(path.join(process.cwd(), 'web', 'public', 'terms.html'));
});

/**
 * Privacy Policy Page
 * GET /privacy
 * Serves the Privacy Policy HTML page for legal compliance
 * Details how user data is collected, used, and protected
 */
router.get('/privacy', (req, res) => {
  // Serve the static privacy.html file from the web/public directory
  res.sendFile(path.join(process.cwd(), 'web', 'public', 'privacy.html'));
});

/**
 * Updates Page
 * GET /updates
 * Serves the latest version updates and changelog information
 * Shows current version features, improvements, and bug fixes
 */
router.get('/updates', (req, res) => {
  // Serve the static updates.html file from the web/public directory
  res.sendFile(path.join(process.cwd(), 'web', 'public', 'updates.html'));
});

/**
 * Complete Changelog Page
 * GET /updates/changelog
 * Serves the complete changelog with all version history
 * Comprehensive view of all updates and changes
 */
router.get('/updates/changelog', (req, res) => {
  // Serve the changelog.html file from the web/public directory
  res.sendFile(path.join(process.cwd(), 'web', 'public', 'changelog.html'));
});

/**
 * Specific Version Update Page
 * GET /updates/:version
 * Serves specific version update information
 * Allows users to view historical version changes
 */
router.get('/updates/:version', (req, res) => {
  const version = req.params.version;
  const versionFile = `updates-${version}.html`;

  try {
    // Serve the specific version file from the web/public/versions directory
    res.sendFile(path.join(process.cwd(), 'web', 'public', 'versions', versionFile));
  } catch (error) {
    // If specific version file doesn't exist, redirect to main updates page
    res.redirect('/updates');
  }
});






/**
 * Service Status Page
 * GET /status
 * Serves the system status page showing service health and uptime information
 * Used for monitoring QuestCord service availability and performance metrics
 */
router.get('/status', (req, res) => {
  // Serve the dedicated status.html file for system monitoring
  res.sendFile(path.join(process.cwd(), 'web', 'public', 'status.html'));
});

/**
 * Root Path Handler with Subdomain Detection
 * GET /
 * Serves different content based on the requesting subdomain:
 * - status.questcord.fun -> status.html (service monitoring)
 * - questcord.fun -> index.html (main application)
 * Enables subdomain-based routing for different application functions
 */
router.get('/', (req, res) => {
  // Check if the request is coming from the status subdomain
  if (req.headers.host && req.headers.host.startsWith('status.')) {
    // Serve the status page for the status subdomain
    res.sendFile(path.join(process.cwd(), 'web', 'public', 'status.html'));
  } else {
    // Serve the main application SPA for the primary domain
    res.sendFile(path.join(process.cwd(), 'web', 'public', 'index.html'));
  }
});

/**
 * Single Page Application Catch-All Route
 * GET /:guildId (numeric Discord IDs only)
 * Catches numeric guild IDs and serves the main SPA
 * Allows client-side routing to handle Discord server ID URLs
 * Uses regex pattern [0-9]+ to match only numeric Discord IDs
 * @param {string} guildId - Numeric Discord guild ID for client-side routing
 */
router.get('/:guildId([0-9]+)', (req,res)=> res.sendFile(path.join(process.cwd(), 'web', 'public', 'index.html')));

// Export the configured router for mounting in the main web server
module.exports = router;
