/**
 * IP Ban Utility Functions
 *
 * Provides helper functions for checking and managing IP bans across
 * both the Discord bot and web server.
 */

const { db } = require('./store_sqlite');

/**
 * Check if an IP address is banned
 * @param {string} ip - IP address to check
 * @returns {object|null} Ban object if banned, null if not banned or expired
 */
function isIPBanned(ip) {
  try {
    const ban = db.prepare('SELECT * FROM ip_bans WHERE ip = ?').get(ip);

    if (!ban) {
      return null;
    }

    // Check if ban has expired
    if (ban.expiresAt && ban.expiresAt <= Date.now()) {
      // Ban has expired, remove it
      db.prepare('DELETE FROM ip_bans WHERE ip = ?').run(ip);
      return null;
    }

    return ban;
  } catch (error) {
    console.error('[ip_bans] Error checking IP ban:', error);
    return null;
  }
}

/**
 * Get client IP address from request (handles proxies like Cloudflare)
 * @param {object} req - Express request object
 * @returns {string} IP address
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

  // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  return ip || 'unknown';
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
      console.log(`[ip_bans] Cleaned up ${result.changes} expired IP bans`);
    }

    return result.changes;
  } catch (error) {
    console.error('[ip_bans] Error cleaning up expired bans:', error);
    return 0;
  }
}

module.exports = {
  isIPBanned,
  getClientIP,
  cleanupExpiredIPBans
};
