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
 *
 * Sends Discord webhook notifications when threats are detected.
 */

const https = require('https');
const http = require('http');

// In-memory tracking of suspicious activity per IP
const suspiciousActivity = new Map();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const tenMinutesAgo = now - 600000;

  for (const [ip, data] of suspiciousActivity.entries()) {
    if (data.lastSeen < tenMinutesAgo) {
      suspiciousActivity.delete(ip);
    }
  }
}, 600000);

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
    const ip = req.headers['cf-connecting-ip'] ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.ip ||
               req.connection.remoteAddress;

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
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('%s SECURITY ALERT: %s severity attack detected', severity.emoji, severity.level);
      console.warn('🌐 IP: %s', ip);
      console.warn('📊 Attempts: %d', tracking.totalAttempts);
      console.warn('🎯 Unique Endpoints: %d', tracking.uniqueEndpoints);
      console.warn('📝 Latest: %s (%s)', req.path, suspiciousCheck.reason);
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Log suspicious request
    console.warn('[Security] Suspicious request from %s: %s (%s)',
                 ip, req.path, suspiciousCheck.reason);
  }

  next();
}

module.exports = { securityMonitor };
