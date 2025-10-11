/**
 * USER AGENT BAN SYSTEM
 * ======================
 * Automatically bans users with specific user agents (bots, scrapers, etc.)
 *
 * User agents in this list will be automatically blocked from accessing the website.
 */

const logger = require('./logger');

/**
 * List of banned user agents (case-insensitive partial matches)
 * Add user agents here that should be automatically blocked
 */
const BANNED_USER_AGENTS = [
  'ivre-masscan',           // Network scanner
  'libredtail-http',        // HTTP library/bot
  'masscan',                // Network scanner
  'zgrab',                  // Network scanner
  'shodan',                 // Search engine scanner
  'censys',                 // Internet scanner
  'nmap',                   // Network scanner
  'sqlmap',                 // SQL injection tool
  'nikto',                  // Web vulnerability scanner
  'acunetix',               // Web vulnerability scanner
  'nessus',                 // Vulnerability scanner
  'metasploit',             // Penetration testing framework
  'burp suite',             // Penetration testing tool
  'zap',                    // OWASP ZAP scanner
];

/**
 * Check if a user agent is banned
 * @param {string} userAgent - The user agent string from the request
 * @returns {boolean} True if banned, false otherwise
 */
function isUserAgentBanned(userAgent) {
  // Don't ban empty/unknown user agents - they might be legitimate
  if (!userAgent || typeof userAgent !== 'string') {
    return false;
  }

  const lowerUA = userAgent.toLowerCase();

  // Check if user agent contains any banned patterns
  // Only ban if it EXPLICITLY matches a known malicious pattern
  for (const bannedUA of BANNED_USER_AGENTS) {
    if (lowerUA.includes(bannedUA.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Get the reason why a user agent was banned
 * @param {string} userAgent - The user agent string
 * @returns {string} The reason for the ban
 */
function getBanReason(userAgent) {
  if (!userAgent) {
    return 'Unknown user agent';
  }

  const lowerUA = userAgent.toLowerCase();

  for (const bannedUA of BANNED_USER_AGENTS) {
    if (lowerUA.includes(bannedUA.toLowerCase())) {
      return `Banned user agent: ${bannedUA}`;
    }
  }

  return 'Banned user agent';
}

/**
 * Add a new user agent to the ban list (runtime addition)
 * @param {string} userAgent - The user agent pattern to ban
 */
function addBannedUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return false;
  }

  const trimmed = userAgent.trim();
  if (trimmed && !BANNED_USER_AGENTS.includes(trimmed)) {
    BANNED_USER_AGENTS.push(trimmed);
    logger.info('[UserAgentBan] Added new banned user agent: %s', trimmed);
    return true;
  }

  return false;
}

/**
 * Get list of all banned user agents
 * @returns {string[]} Array of banned user agent patterns
 */
function getBannedUserAgents() {
  return [...BANNED_USER_AGENTS];
}

module.exports = {
  isUserAgentBanned,
  getBanReason,
  addBannedUserAgent,
  getBannedUserAgents
};
