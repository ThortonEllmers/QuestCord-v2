/**
 * SECURITY MONITORING AND INTRUSION DETECTION
 * ============================================
 *
 * Monitors for suspicious activity patterns that may indicate:
 * - Brute force attempts
 * - Path traversal attacks
 * - Automated scanning/probing
 * - Credential stuffing
 * - API endpoint enumeration
 * - Rate limit violations (automatic IP ban)
 *
 * Sends Discord webhook notifications when threats are detected.
 */

const https = require('https');
const http = require('http');
const { db, generateBanId } = require('../utils/store_sqlite');
const { normalizeIP } = require('../utils/ip_bans');
const logger = require('../utils/logger');

// In-memory tracking of suspicious activity per IP
const suspiciousActivity = new Map();

// Rate limit tracking per IP (for automatic bans)
const rateLimitTracking = new Map();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const tenMinutesAgo = now - 600000;
  const oneMinuteAgo = now - 60000;

  // Clean up suspicious activity tracking
  for (const [ip, data] of suspiciousActivity.entries()) {
    if (data.lastSeen < tenMinutesAgo) {
      suspiciousActivity.delete(ip);
    }
  }

  // Clean up rate limit tracking (remove entries older than 1 minute)
  for (const [ip, data] of rateLimitTracking.entries()) {
    // Remove old requests from the tracking window
    data.requests = data.requests.filter(timestamp => timestamp > oneMinuteAgo);

    // If no recent requests, remove the IP from tracking
    if (data.requests.length === 0) {
      rateLimitTracking.delete(ip);
    }
  }
}, 60000); // Run cleanup every minute

/**
 * Patterns that indicate malicious/suspicious activity
 */
const SUSPICIOUS_PATTERNS = {
  // Common admin/config paths that attackers probe
  adminPaths: [
    '/admin', '/administrator', '/wp-admin', '/phpmyadmin', '/cpanel',
    '/webadmin', '/controlpanel', '/management', '/config', '/.env',
    '/wp-login', '/login.php', '/admin.php', '/administrator.php'
  ],

  // Path traversal attempts
  traversal: ['../', '..\\', '%2e%2e', 'etc/passwd', 'windows/system32'],

  // SQL injection patterns
  sqlInjection: ["'", '"', 'union', 'select', 'drop', 'insert', 'update', 'delete', '--', ';--'],

  // Script injection patterns
  xss: ['<script', 'javascript:', 'onerror=', 'onload=', 'eval(', 'alert('],

  // API endpoint enumeration
  apiProbing: ['/api/v1', '/api/v2', '/v1/', '/v2/', '/graphql', '/rest/'],

  // Common exploit attempts
  exploits: ['/shell', '/backdoor', '/cmd', '/exec', '.php', '.asp', '.jsp', '/cgi-bin']
};

/**
 * Check if a request path is suspicious
 */
function isSuspiciousPath(path) {
  const lowerPath = path.toLowerCase();

  // Check admin paths
  if (SUSPICIOUS_PATTERNS.adminPaths.some(p => lowerPath.includes(p))) {
    return { suspicious: true, reason: 'Admin path probing' };
  }

  // Check path traversal
  if (SUSPICIOUS_PATTERNS.traversal.some(p => lowerPath.includes(p))) {
    return { suspicious: true, reason: 'Path traversal attempt' };
  }

  // Check SQL injection
  if (SUSPICIOUS_PATTERNS.sqlInjection.some(p => lowerPath.includes(p))) {
    return { suspicious: true, reason: 'SQL injection attempt' };
  }

  // Check XSS
  if (SUSPICIOUS_PATTERNS.xss.some(p => lowerPath.includes(p))) {
    return { suspicious: true, reason: 'XSS attempt' };
  }

  // Check exploit paths
  if (SUSPICIOUS_PATTERNS.exploits.some(p => lowerPath.includes(p))) {
    return { suspicious: true, reason: 'Exploit attempt' };
  }

  return { suspicious: false };
}

/**
 * Determine severity level based on attempt count
 */
function getSeverity(totalAttempts) {
  if (totalAttempts >= 5) {
    return { level: 'HIGH', emoji: '🔴', color: 0xFF0000 }; // Red
  } else if (totalAttempts >= 3) {
    return { level: 'MEDIUM', emoji: '🟠', color: 0xFF6B00 }; // Orange
  } else {
    return { level: 'LOW', emoji: '🟡', color: 0xFFFF00 }; // Yellow
  }
}

/**
 * Automatically ban an IP address for rate limit violation
 */
async function autobanIP(ip, requestCount, timeWindow, discordClient) {
  try {
    // Normalize the IP for consistent storage
    const normalizedIP = normalizeIP(ip);

    // Check if IP is already banned
    const existingBan = db.prepare('SELECT * FROM ip_bans WHERE ip=?').get(normalizedIP);

    if (existingBan) {
      console.log('[Security] IP %s already banned, skipping autoban', normalizedIP);
      return false;
    }

    // Generate ban ID
    const banId = generateBanId();

    // Ban for 24 hours (1440 minutes)
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    const reason = `Automatic ban: Rate limit violation (${requestCount} unique endpoints in ${timeWindow}s)`;

    // Insert ban into database
    db.prepare(`
      INSERT INTO ip_bans(banId, ip, reason, bannedBy, bannedAt, expiresAt)
      VALUES(?,?,?,?,?,?)
    `).run(banId, normalizedIP, reason, 'SYSTEM_AUTO_BAN', Date.now(), expiresAt);

    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.warn('🔨 AUTOMATIC IP BAN APPLIED');
    console.warn('🌐 IP: %s', normalizedIP);
    console.warn('📊 Violation: %d unique endpoints in %d seconds', requestCount, timeWindow);
    console.warn('⏰ Duration: 24 hours');
    console.warn('🆔 Ban ID: %s', banId);
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Send Discord notification via bot
    await sendAutobanAlert({
      ip: normalizedIP,
      banId,
      requestCount,
      timeWindow,
      expiresAt
    }, discordClient);

    return true;
  } catch (error) {
    console.error('[Security] Failed to autoban IP %s:', ip, error.message);
    return false;
  }
}

/**
 * Send Discord notification for automatic bans via bot
 */
async function sendAutobanAlert(data, discordClient) {
  try {
    if (!discordClient) {
      console.warn('[Security] Discord client not available for autoban alert');
      return;
    }

    const { EmbedBuilder } = require('discord.js');
    const SECURITY_CHANNEL_ID = '1404555278594342993';

    const channel = await discordClient.channels.fetch(SECURITY_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn('[Security] Could not find security channel for autoban alert');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔨 Automatic IP Ban Applied')
      .setColor(0xFF0000) // Red
      .setDescription(`**${data.ip}** has been automatically banned for rate limit violation`)
      .addFields(
        {
          name: '📊 Violation Details',
          value: `\`\`\`
Unique Endpoints: ${data.requestCount} in ${data.timeWindow}s
Threshold: 10+ unique endpoints per 60s
Ban Duration: 24 hours
\`\`\``,
          inline: false
        },
        {
          name: '🌐 IP Information',
          value: `\`\`\`
IP Address: ${data.ip}
Ban ID: ${data.banId}
Expires: ${new Date(data.expiresAt).toISOString()}
\`\`\``,
          inline: false
        },
        {
          name: '⚙️ Ban Details',
          value: `• **Type:** Automatic (System)\n• **Reason:** Rate limit violation\n• **Action:** All web access blocked`,
          inline: false
        }
      )
      .setFooter({ text: 'QuestCord Auto-Ban System', iconURL: discordClient.user.displayAvatarURL() })
      .setTimestamp();

    await channel.send({
      content: '<@378501056008683530>',
      embeds: [embed]
    });

    console.log('[Security] Autoban notification sent to Discord');
  } catch (error) {
    console.error('[Security] Failed to send autoban Discord notification:', error.message);
  }
}

/**
 * Send Discord webhook notification
 */
async function sendSecurityAlert(data) {
  const webhookUrl = process.env.SECURITY_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Security] No SECURITY_WEBHOOK_URL configured');
    return;
  }

  // Parse webhook URL
  const url = new URL(webhookUrl);
  const isHttps = url.protocol === 'https:';

  // Determine severity
  const severity = getSeverity(data.totalAttempts);

  // Create embed for Discord
  const embed = {
    title: `${severity.emoji} Security Alert - ${severity.level} Severity`,
    description: `Suspicious activity detected from **${data.ip}**`,
    color: severity.color,
    fields: [
      {
        name: '📊 Attack Statistics',
        value: `\`\`\`
Total Attempts: ${data.totalAttempts}
Unique Endpoints: ${data.uniqueEndpoints}
Time Window: ${Math.round((Date.now() - data.firstSeen) / 1000)}s
\`\`\``,
        inline: false
      },
      {
        name: '🎯 Targeted Endpoints',
        value: data.endpoints.slice(0, 10).map(e =>
          `• \`${e.path}\` (${e.count}x) - *${e.reason}*`
        ).join('\n') + (data.endpoints.length > 10 ? `\n... and ${data.endpoints.length - 10} more` : ''),
        inline: false
      },
      {
        name: '🌐 Source Information',
        value: `\`\`\`
IP Address: ${data.ip}
User-Agent: ${data.userAgent || 'Unknown'}
\`\`\``,
        inline: false
      }
    ],
    footer: {
      text: 'QuestCord Security System'
    },
    timestamp: new Date().toISOString()
  };

  const payload = JSON.stringify({
    content: '<@378501056008683530>',
    username: 'QuestCord Security',
    avatar_url: 'https://questcord.fun/images/questcord-icon.png',
    embeds: [embed]
  });

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const protocol = isHttps ? https : http;
    const req = protocol.request(options, (res) => {
      if (res.statusCode === 204 || res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Webhook returned status ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Security monitoring middleware
 */
function securityMonitor(req, res, next) {
  // Get Discord client from app locals (set by index.js when bot is ready)
  const discordClient = req.app?.locals?.discordClient || null;

  // Get client IP for tracking
  const ip = req.headers['cf-connecting-ip'] ||
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.ip ||
             req.connection.remoteAddress;

  // ===== RATE LIMIT TRACKING (for automatic bans) =====
  // Only track SUSPICIOUS/UNKNOWN endpoints for rate limiting
  // Legitimate pages (main, status, terms, etc.) should NOT count toward ban threshold
  const now = Date.now();
  const sixtySecondsAgo = now - 60000;

  // Define legitimate pages that should NOT count toward autoban
  const isLegitPage = req.path === '/' ||
                      req.path === '/healthz' ||
                      req.path === '/status' ||
                      req.path === '/status.html' ||
                      req.path === '/terms' ||
                      req.path === '/terms.html' ||
                      req.path === '/privacy' ||
                      req.path === '/privacy.html' ||
                      req.path === '/updates' ||
                      req.path === '/updates.html' ||
                      req.path === '/changelog' ||
                      req.path === '/changelog.html' ||
                      req.path === '/banned' ||
                      req.path === '/banned.html' ||
                      req.path === '/404.html' ||
                      req.path === '/index.html' ||
                      req.path.startsWith('/api/') ||
                      req.path.startsWith('/auth/') ||
                      req.path.startsWith('/images/') ||
                      req.path.startsWith('/shared/') ||
                      req.path.startsWith('/store') ||
                      req.path.startsWith('/health') ||
                      req.path.startsWith('/enhanced-stats') ||
                      req.path.startsWith('/updates/') ||
                      req.path.match(/^\/\d{17,19}$/) || // Discord guild ID routes
                      req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|json)$/); // Static files

  // Get or initialize rate data for this IP (outside if/else for proper scoping)
  let rateData = rateLimitTracking.get(ip);

  // Only track suspicious/unknown endpoints
  if (!isLegitPage) {
    // Create tracking if it doesn't exist
    if (!rateData) {
      rateData = {
        requests: [],
        endpoints: [],
        banned: false
      };
      rateLimitTracking.set(ip, rateData);
    }

    // Remove requests older than 60 seconds
    rateData.requests = rateData.requests.filter(timestamp => timestamp > sixtySecondsAgo);

    // Add current request with endpoint and timestamp
    rateData.requests.push(now);

    // Track endpoint for violation reporting
    const existingEndpoint = rateData.endpoints.find(e => e.path === req.path);
    if (existingEndpoint) {
      existingEndpoint.count++;
    } else {
      rateData.endpoints.push({
        path: req.path,
        method: req.method,
        count: 1
      });
    }
  }
  // For legitimate pages, rateData may be undefined if user has only visited legitimate pages
  // This is fine - they shouldn't be tracked or banned

  // Debug logging: Show current request count every 5th request
  if (rateData && rateData.requests && rateData.requests.length % 5 === 0 && rateData.requests.length > 0) {
    logger.warn('[RateLimit] IP %s: %d requests in last 60s (endpoints: %d unique)',
      ip, rateData.requests.length, rateData.endpoints.length);
  }

  // AUTOMATIC BANNING - Ban IPs that exceed rate limits
  // Threshold: 10+ unique endpoints in 60 seconds (indicates automated scanning)
  // Normal page loads trigger multiple requests but to the SAME endpoints
  if (rateData && rateData.endpoints && rateData.endpoints.length >= 10 && !rateData.banned) {
    const timeWindow = Math.round((now - rateData.requests[0]) / 1000);

    // Sort endpoints by most accessed
    rateData.endpoints.sort((a, b) => b.count - a.count);
    const topEndpoints = rateData.endpoints.slice(0, 5).map(e =>
      `${e.method} ${e.path} (${e.count}x)`
    ).join(', ');

    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.warn('🔨 AUTOMATIC BAN TRIGGERED');
    console.warn('🌐 IP: %s', ip);
    console.warn('📊 Requests: %d in %d seconds', rateData.requests.length, timeWindow);
    console.warn('🎯 Unique Endpoints: %d', rateData.endpoints.length);
    console.warn('📝 Top Endpoints: %s', topEndpoints);
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Mark as banned to prevent multiple ban attempts
    rateData.banned = true;

    // Trigger automatic ban (async, don't block request)
    autobanIP(ip, rateData.endpoints.length, timeWindow, discordClient).catch(error => {
      console.error('[Security] Failed to autoban IP:', error.message);
    });
  }

  // ===== SUSPICIOUS PATH MONITORING =====
  // Skip monitoring for legitimate static files
  const isLegitStatic = req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|json)$/);

  // Skip monitoring for known good paths
  const isKnownGood = req.path === '/' ||
                      req.path === '/healthz' ||
                      req.path.startsWith('/api/') ||
                      req.path.startsWith('/auth/') ||
                      req.path.startsWith('/images/') ||
                      req.path.startsWith('/shared/') ||
                      req.path.startsWith('/store') ||
                      req.path.startsWith('/health') ||
                      req.path.startsWith('/enhanced-stats') ||
                      req.path === '/status' ||
                      req.path === '/terms' ||
                      req.path === '/privacy' ||
                      req.path === '/updates' ||
                      req.path === '/banned' ||
                      req.path === '/banned.html' ||
                      req.path.startsWith('/updates/') ||
                      req.path.match(/^\/\d{17,19}$/) || // Discord guild ID routes
                      req.path.endsWith('.html');

  if (isLegitStatic || isKnownGood) {
    return next();
  }

  // Check if path is suspicious
  const suspiciousCheck = isSuspiciousPath(req.path);

  if (suspiciousCheck.suspicious) {
    // Get or create tracking entry for this IP
    let tracking = suspiciousActivity.get(ip);

    if (!tracking) {
      tracking = {
        ip,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalAttempts: 0,
        uniqueEndpoints: 0,
        endpoints: [],
        userAgent: req.headers['user-agent'] || 'Unknown',
        alertSent: false
      };
      suspiciousActivity.set(ip, tracking);
    }

    // Update tracking
    tracking.lastSeen = Date.now();
    tracking.totalAttempts++;

    // Add endpoint to list if not already tracked
    const existingEndpoint = tracking.endpoints.find(e => e.path === req.path);
    if (existingEndpoint) {
      existingEndpoint.count++;
    } else {
      tracking.endpoints.push({
        path: req.path,
        reason: suspiciousCheck.reason,
        count: 1,
        timestamp: Date.now()
      });
      tracking.uniqueEndpoints++;
    }

    // Sort endpoints by count (most attempted first)
    tracking.endpoints.sort((a, b) => b.count - a.count);

    // Determine when to send alerts based on attempt count
    const shouldSendAlert =
      (tracking.totalAttempts === 1) ||  // First attempt (LOW)
      (tracking.totalAttempts === 3) ||  // Third attempt (MEDIUM)
      (tracking.totalAttempts === 5) ||  // Fifth attempt (HIGH)
      (tracking.totalAttempts === 10) || // Every 5 after threshold
      (tracking.totalAttempts === 15) ||
      (tracking.totalAttempts === 20) ||
      (tracking.totalAttempts % 10 === 0 && tracking.totalAttempts > 20); // Every 10 after 20

    if (shouldSendAlert) {
      // Send alert asynchronously (don't block the request)
      sendSecurityAlert(tracking).catch(error => {
        console.error('[Security] Failed to send webhook alert:', error.message);
      });

      const severity = getSeverity(tracking.totalAttempts);
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('%s SECURITY ALERT: %s severity attack detected', severity.emoji, severity.level);
      logger.warn('🌐 IP: %s', ip);
      logger.warn('📊 Attempts: %d', tracking.totalAttempts);
      logger.warn('🎯 Unique Endpoints: %d', tracking.uniqueEndpoints);
      logger.warn('📝 Latest: %s (%s)', req.path, suspiciousCheck.reason);
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Log suspicious request
    logger.warn('[Security] Suspicious request from %s: %s (%s)',
                 ip, req.path, suspiciousCheck.reason);
  }

  next();
}

module.exports = { securityMonitor };
