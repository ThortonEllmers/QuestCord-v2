/**
 * IP Ban Utility Functions
 *
 * Provides helper functions for checking and managing IP bans across
 * both the Discord bot and web server.
 * Supports IPv4, IPv6, and IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
 */

const { db } = require('./store_sqlite');
const logger = require('./logger');

/**
 * Normalize an IP address to a consistent format
 * Converts IPv4-mapped IPv6 addresses to IPv4 for consistency
 * @param {string} ip - IP address to normalize
 * @returns {string} Normalized IP address
 */
function normalizeIP(ip) {
  if (!ip) return 'unknown';

  // Remove IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  // Convert IPv4-compatible IPv6 to IPv4 (::192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::') && !ip.includes(':', 2)) {
    return ip.substring(2);
  }

  return ip;
}

/**
 * Validate IP address format (supports IPv4 and IPv6)
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid IP address
 */
function isValidIP(ip) {
  if (!ip) return false;

  // IPv4 regex pattern
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex pattern (supports full and compressed formats)
  const ipv6Regex = /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Check if an IP address is banned
 * Supports IPv4, IPv6, and IPv4-mapped IPv6 addresses
 * @param {string} ip - IP address to check
 * @returns {object|null} Ban object if banned, null if not banned or expired
 */
function isIPBanned(ip) {
  try {
    // Normalize the IP address for consistent lookups
    const normalizedIP = normalizeIP(ip);

    // Check for exact match first
    let ban = db.prepare('SELECT * FROM ip_bans WHERE ip = ?').get(normalizedIP);

    // If not found and this was an IPv4-mapped IPv6, also check the original format
    if (!ban && ip.startsWith('::ffff:')) {
      ban = db.prepare('SELECT * FROM ip_bans WHERE ip = ?').get(ip);
    }

    if (!ban) {
      return null;
    }

    // Check if ban has expired
    if (ban.expiresAt && ban.expiresAt <= Date.now()) {
      // Ban has expired, remove it
      db.prepare('DELETE FROM ip_bans WHERE ip = ?').run(ban.ip);
      return null;
    }

    return ban;
  } catch (error) {
    logger.error('[IP Bans] Error checking IP ban:', error);
    return null;
  }
}

/**
 * Get client IP address from request (handles proxies like Cloudflare)
 * Returns normalized IP address for consistent storage
 * @param {object} req - Express request object
 * @returns {string} Normalized IP address
 */
function getClientIP(req) {
  // Check for Cloudflare's connecting IP header
  let ip = req.headers['cf-connecting-ip'];

  // Fall back to X-Forwarded-For (first IP in the chain)
  if (!ip && req.headers['x-forwarded-for']) {
    ip = req.headers['x-forwarded-for'].split(',')[0].trim();
  }

  // Fall back to X-Real-IP
  if (!ip) {
    ip = req.headers['x-real-ip'];
  }

  // Fall back to connection remote address
  if (!ip) {
    ip = req.connection?.remoteAddress || req.socket?.remoteAddress;
  }

  // Normalize IP address (converts IPv4-mapped IPv6 to IPv4)
  return normalizeIP(ip);
}

/**
 * Clean up expired IP bans from database
 * @returns {number} Number of bans removed
 */
function cleanupExpiredIPBans() {
  try {
    const result = db.prepare(`
      DELETE FROM ip_bans
      WHERE expiresAt IS NOT NULL AND expiresAt <= ?
    `).run(Date.now());

    if (result.changes > 0) {
      logger.info(`[IP Bans] Cleaned up ${result.changes} expired IP bans`);
    }

    return result.changes;
  } catch (error) {
    logger.error('[IP Bans] Error cleaning up expired bans:', error);
    return 0;
  }
}

module.exports = {
  isIPBanned,
  getClientIP,
  cleanupExpiredIPBans,
  normalizeIP,
  isValidIP
};
