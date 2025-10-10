/**
 * QuestCord Web Server
 * ====================
 * Main web server setup and Express configuration for the QuestCord bot.
 * This file creates and configures the Express application that serves:
 * - Interactive map interface for Discord server locations
 * - OAuth authentication with Discord
 * - API endpoints for real-time server data
 * - Store/shop interface for premium features
 * - Payment processing integration
 * - Static file serving for web assets
 * 
 * Updated mount logic to accept both function and router exports for flexibility.
 */

// Import Express framework for creating the web server
const express = require('express');
// Import session middleware for managing user sessions across requests
const session = require('express-session');
// Import path utilities for file system operations
const path = require('path');
// Import custom logger utility for consistent logging across the application
const _logger = require('../utils/logger');
// Import route mounting function that registers all API and page routes
const mountRoutes = require('./routes');
// Import database connection for server data storage and retrieval
const { db } = require('../utils/store_sqlite');
// Import geo utility to check and fix Discord servers located in water on the map
const { checkAndFixWaterServers } = require('../utils/geo');
// Import security headers middleware for protecting against common web vulnerabilities
const { securityHeaders } = require('./security');
// Import IP ban utilities for blocking banned IP addresses
const { isIPBanned, getClientIP, cleanupExpiredIPBans } = require('../utils/ip_bans');
// Import security monitoring middleware for detecting attack attempts
const { securityMonitor } = require('./security-monitor');
// Define constant for session cookie expiration (24 hours in milliseconds)
const ONE_DAY = 24 * 60 * 60 * 1000;

// Create a robust logger fallback system to handle various logger export patterns
// This ensures logging works regardless of how the logger module is exported
const logger = (_logger && typeof _logger.info === 'function')
  ? _logger  // Use direct logger export if it has the required methods
  : (_logger && _logger.default && typeof _logger.default.info === 'function')
    ? _logger.default  // Use default export if available and has required methods
    : { info: console.log, warn: console.warn, error: console.error, debug: console.debug };  // Fallback to console methods

/**
 * Creates and configures the main Express web server instance
 * Handles all web requests, API calls, authentication, and static file serving
 * @returns {Object} Object containing the Express app and HTTP server instance
 */
function createWebServer() {
  // Create the main Express application instance
  const app = express();

  // Trust the first proxy in the chain (required for reverse proxy setups like Cloudflare, Nginx)
  // This allows Express to correctly identify client IP addresses and handle HTTPS properly
  app.set('trust proxy', 1);
  
  // Apply comprehensive security headers to all incoming requests
  // Includes CSP, HSTS, X-Frame-Options, and other security measures
  app.use(securityHeaders);

  // Security monitoring - Detect and alert on suspicious activity patterns
  // Monitors for brute force attempts, path traversal, SQL injection, etc.
  app.use(securityMonitor);

  // IP Ban Middleware - Block banned IP addresses from accessing the website
  // This must come early in the middleware chain to prevent banned IPs from consuming resources
  app.use(async (req, res, next) => {
    // Skip IP check for the banned page itself to avoid redirect loop
    if (req.path === '/banned.html' || req.path === '/banned') {
      return next();
    }

    // Get client's real IP address (handles proxies like Cloudflare)
    const clientIP = getClientIP(req);

    // Check if IP is banned
    const ban = isIPBanned(clientIP);

    if (ban) {
      // Log the blocked access attempt
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('🚫 BANNED IP ACCESS BLOCKED');
      logger.warn('🌐 IP: %s', clientIP);
      logger.warn('📝 Reason: %s', ban.reason);
      logger.warn('⏰ Time: %s', new Date().toISOString());
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Fetch Discord client to get staff member's username
      let bannedByName = 'QuestCord Staff';
      try {
        const client = req.app.locals.discordClient;
        if (client && ban.bannedBy) {
          const user = await client.users.fetch(ban.bannedBy).catch(() => null);
          if (user) {
            bannedByName = user.username;
          }
        }
      } catch (e) {
        // Fallback to default name if fetching fails
      }

      // Redirect to ban page with details
      const banPageUrl = `/banned.html?ip=${encodeURIComponent(clientIP)}&reason=${encodeURIComponent(ban.reason)}&bannedAt=${ban.bannedAt}&expiresAt=${ban.expiresAt || 'null'}&bannedBy=${encodeURIComponent(bannedByName)}&banId=${encodeURIComponent(ban.banId)}`;
      return res.redirect(banPageUrl);
    }

    // IP is not banned, continue to next middleware
    next();
  });

  // Handle preflight OPTIONS requests for Cross-Origin Resource Sharing (CORS)
  // This middleware responds to browser preflight requests before actual API calls
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      // Send empty 200 response for OPTIONS requests to satisfy CORS preflight
      res.status(200).end();
      return;
    }
    // Continue to next middleware for non-OPTIONS requests
    next();
  });
  
  // Parse JSON request bodies with 1MB size limit to prevent DoS attacks
  app.use(express.json({ limit: '1mb' }));
  // Parse URL-encoded form data with extended syntax support and 1MB limit
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  
  // Perform asynchronous check for Discord servers incorrectly positioned in water on the interactive map
  // This is a failsafe that runs when the web server starts (useful if the Discord bot isn't running)
  setTimeout(async () => {
    try {
      // Log the start of the water check process for debugging purposes
      logger.info('[Web] Starting water check...');
      // Check database for servers with invalid water coordinates and fix them
      await checkAndFixWaterServers(db);
    } catch (error) {
      // Log any errors that occur during the water check process
      logger.error('[Web] Water check failed: %s', error.message);
    }
  }, 5000); // 5-second delay to ensure database and other dependencies are fully initialized

  // Periodic cleanup of expired IP bans (every hour)
  setInterval(() => {
    try {
      cleanupExpiredIPBans();
    } catch (error) {
      logger.error('[Web] IP ban cleanup failed: %s', error.message);
    }
  }, 60 * 60 * 1000); // Run every hour

  // Initial cleanup on startup
  setTimeout(() => {
    try {
      const cleaned = cleanupExpiredIPBans();
      if (cleaned > 0) {
        logger.info('[Web] Cleaned up %d expired IP bans on startup', cleaned);
      }
    } catch (error) {
      logger.error('[Web] Initial IP ban cleanup failed: %s', error.message);
    }
  }, 10000); // 10-second delay

  // Configure cookie domain from environment variable (useful for subdomain sharing)
  // Undefined allows cookies to work on any domain (good for development)
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  
  // Read cookie security setting from environment variable
  const secureEnv = process.env.COOKIE_SECURE;
  
  // Parse the COOKIE_SECURE environment variable to boolean
  // Only set secure cookies if explicitly enabled via environment variable
  const cookieSecure = (typeof secureEnv === 'string')
    ? (secureEnv.toLowerCase() === 'true')  // Convert string "true" to boolean true
    : false; // Default to insecure cookies for local development environments

  // Configure Express session middleware for maintaining user authentication state
  // Sessions are required for OAuth flow and maintaining login status across requests
  //
  // NOTE: Using MemoryStore (default) for sessions. While not recommended for multi-process
  // production deployments, it's acceptable for single-process PM2 deployments. For true
  // horizontal scaling, consider using connect-redis or express-session-sqlite.
  const sessionConfig = {
    name: 'questcord_session',  // Custom session cookie name (helps with security through obscurity)
    secret: process.env.SESSION_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET environment variable is required in production');
      }
      return 'dev-fallback-secret-do-not-use-in-production';
    })(),  // Secret key for signing session cookies
    resave: false,  // Don't save session if unmodified (performance optimization)
    saveUninitialized: false,  // Don't create session until something is stored (GDPR compliance)
    cookie: {
      secure: cookieSecure,  // Only send cookies over HTTPS in production
      httpOnly: true,  // Prevent XSS attacks by making cookies inaccessible to JavaScript
      maxAge: ONE_DAY,  // Session expires after 24 hours of inactivity
      domain: cookieDomain,  // Set cookie domain for subdomain sharing if configured
      sameSite: 'lax'  // CSRF protection while allowing normal navigation
    }
  };

  app.use(session(sessionConfig));

  // Add HTTP request logging middleware BEFORE routes (optimized - skip static files)
  app.use((req, res, next) => {
    // Skip logging for static assets to reduce noise
    const isStatic = req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/);
    const isHealthCheck = req.path === '/healthz';

    if (isStatic || isHealthCheck) {
      return next();
    }

    const startTime = Date.now();

    // Capture the original end function
    const originalEnd = res.end;

    // Override res.end to log response
    res.end = function(chunk, encoding) {
      const duration = Date.now() - startTime;
      const statusEmoji = res.statusCode < 400 ? '✅' : (res.statusCode < 500 ? '⚠️' : '❌');

      // Log all requests with separator lines
      logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.aqua('🌐 %s %s', req.method, req.path);
      logger.aqua('%s %d (%dms) | IP: %s', statusEmoji, res.statusCode, duration, req.ip || req.connection.remoteAddress);
      if (req.session && req.session.user) {
        logger.aqua('👤 %s (@%s)', req.session.user.username, req.session.user.id);
      }
      logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Call original end function to actually send the response
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  });

  // Serve static files (CSS, JavaScript, images, etc.) from the web/public directory
  // This middleware handles all requests for static assets used by the web interface
  app.use(express.static(path.join(process.cwd(), 'web', 'public')));

  // Create convenient login URL aliases that redirect to the Discord OAuth flow
  // These provide user-friendly URLs for initiating the authentication process
  app.get('/auth/login', (_req, res) => res.redirect('/auth/discord'));  // Redirect /auth/login to Discord OAuth
  app.get('/login', (_req, res) => res.redirect('/auth/discord'));  // Redirect /login to Discord OAuth

  // ---- Robust route mounting system ----
  // This section handles different module export patterns to ensure routes are properly mounted
  // regardless of how the routes module exports its functionality
  try {
    // Check if mountRoutes is exported as a direct function
    if (typeof mountRoutes === 'function') {
      // Call the function directly, passing the Express app to register all routes
      mountRoutes(app);
    } 
    // Check if mountRoutes is exported with ES6 default export pattern
    else if (mountRoutes && mountRoutes.default && typeof mountRoutes.default === 'function') {
      // Call the default export function to register routes
      mountRoutes.default(app);
    } 
    // Check if mountRoutes is exported as an Express router with handle method
    else if (mountRoutes && typeof mountRoutes.handle === 'function') {
      // Mount the router directly as middleware
      app.use(mountRoutes);
    } 
    // If none of the expected export patterns match, log a warning
    else {
      logger.warn('[routes] Unsupported export shape; no routes mounted');
    }
  } catch (e) {
    // Log any errors that occur during route mounting for debugging
    logger.error('[routes] mount failed %s', e && e.stack || e);
  }

  // Health check endpoint for monitoring services and load balancers
  // Returns a simple JSON response indicating the server is operational
  app.get('/healthz', (_req, res) => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    const formattedUptime = parts.join(' ');

    res.json({
      ok: true,
      status: 'healthy',
      uptime: formattedUptime,
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================================
  // 404 ERROR HANDLER - CUSTOM NOT FOUND PAGE
  // ============================================================================
  // This must be defined AFTER all routes to catch any unhandled requests
  // Detects suspicious paths and shows appropriate warnings on the 404 page
  app.use(async (req, res, next) => {
    // Get client IP
    const clientIP = getClientIP(req);

    // Check if IP is banned - if so, show banned page instead of 404
    const ban = isIPBanned(clientIP);
    if (ban) {
      // Fetch Discord client to get staff member's username
      let bannedByName = 'QuestCord Staff';
      try {
        const client = req.app.locals.discordClient;
        if (client && ban.bannedBy) {
          const user = await client.users.fetch(ban.bannedBy).catch(() => null);
          if (user) {
            bannedByName = user.username;
          }
        }
      } catch (e) {
        // Fallback to default name if fetching fails
      }

      // Redirect to ban page with details
      const banPageUrl = `/banned.html?ip=${encodeURIComponent(clientIP)}&reason=${encodeURIComponent(ban.reason)}&bannedAt=${ban.bannedAt}&expiresAt=${ban.expiresAt || 'null'}&bannedBy=${encodeURIComponent(bannedByName)}&banId=${encodeURIComponent(ban.banId)}`;
      return res.status(403).redirect(banPageUrl);
    }

    // Check if path is suspicious (admin probing, exploits, etc.)
    const lowerPath = req.path.toLowerCase();
    let suspicious = false;

    // Patterns that indicate malicious intent
    const suspiciousPatterns = [
      '/admin', '/administrator', '/wp-admin', '/phpmyadmin', '/cpanel',
      '/webadmin', '/controlpanel', '/management', '/config', '/.env',
      '/wp-login', '.php', '.asp', '.jsp', '/cgi-bin', '/shell',
      '/backdoor', '/cmd', '/exec', '../', '..\\', '%2e%2e',
      'etc/passwd', 'windows/system32', 'union', 'select', '<script'
    ];

    suspicious = suspiciousPatterns.some(pattern => lowerPath.includes(pattern));

    // Log 404 with suspicion level
    if (suspicious) {
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('🚨 SUSPICIOUS 404 - ADMIN PATH PROBING');
      logger.warn('🌐 IP: %s', clientIP);
      logger.warn('📍 Path: %s', req.path);
      logger.warn('🕐 Time: %s', new Date().toISOString());
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Send Discord notification via bot for suspicious 404s
      try {
        const client = req.app.locals.discordClient;
        if (client) {
          const { EmbedBuilder } = require('discord.js');
          const SECURITY_CHANNEL_ID = '1404555278594342993';

          const channel = await client.channels.fetch(SECURITY_CHANNEL_ID).catch(() => null);
          if (channel && channel.isTextBased()) {
            // Calculate threat severity
            let severity = 'MEDIUM';
            let severityColor = 0xfaa61a; // Yellow/Orange for MEDIUM
            let severityEmoji = '🟡';

            const criticalPatterns = ['/admin', '/.env', '/config', 'passwd', 'cmd', 'shell', 'backdoor'];
            const highPatterns = ['../', '..\\', '%2e%2e', 'union', 'select'];

            if (criticalPatterns.some(p => lowerPath.includes(p))) {
              severity = 'CRITICAL';
              severityColor = 0xed4245; // Red for CRITICAL
              severityEmoji = '🔴';
            } else if (highPatterns.some(p => lowerPath.includes(p))) {
              severity = 'HIGH';
              severityColor = 0xff6b00; // Orange for HIGH
              severityEmoji = '🟠';
            }

            const embed = new EmbedBuilder()
              .setTitle(`${severityEmoji} Suspicious 404 - Security Alert`)
              .setColor(severityColor)
              .setDescription('**Potential attack or reconnaissance attempt detected**')
              .addFields(
                { name: '🌐 IP Address', value: `\`${clientIP}\``, inline: true },
                { name: '⚠️ Threat Level', value: `**${severity}**`, inline: true },
                { name: '📍 Attempted Path', value: `\`\`\`${req.path}\`\`\``, inline: false },
                { name: '🔧 HTTP Method', value: req.method, inline: true },
                { name: '🌍 User Agent', value: req.get('user-agent') ? `\`${req.get('user-agent').substring(0, 100)}\`` : 'Unknown', inline: false },
                { name: '🕐 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
              )
              .setFooter({ text: 'QuestCord Security Monitor', iconURL: client.user.displayAvatarURL() })
              .setTimestamp();

            await channel.send({ embeds: [embed] });
            logger.info('[Security] Suspicious 404 notification sent to Discord');
          }
        }
      } catch (error) {
        logger.error('[Security] Failed to send Discord notification for suspicious 404: %s', error.message);
      }
    }

    // Redirect to 404 page with details
    const notFoundUrl = `/404.html?path=${encodeURIComponent(req.path)}&suspicious=${suspicious}&ip=${encodeURIComponent(clientIP)}`;
    res.status(404).redirect(notFoundUrl);
  });

  // Determine the port to bind the web server to using a priority system:
  // 1. Configuration file setting (highest priority)
  // 2. Environment variable PORT
  // 3. Default: port 80 for standard HTTP
  const config = require('../utils/config');
  const port = config.web?.port || process.env.PORT || 80;

  // Start the HTTP server and bind it to the determined port
  const server = app.listen(port, () => {
    // Get the current environment (defaults to production for security)
    const env = process.env.NODE_ENV || 'production';
    const publicUrl = config.web?.publicBaseUrl || `http://localhost:${port}`;

    // Log server startup information for monitoring and debugging
    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.aqua('🌐 WEB SERVER STARTED');
    logger.aqua('📡 Port: %d', port);
    logger.aqua('🌍 Environment: %s', env);
    logger.aqua('🔗 Public URL: %s', publicUrl);
    logger.aqua('⏰ Started at: %s', new Date().toISOString());
    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });

  // Return both the Express app and HTTP server instances for external use
  // This allows the caller to perform additional operations on either object
  return { app, server };
}

// Export the createWebServer function using CommonJS syntax for compatibility
module.exports = { createWebServer };
// Also provide ES6 default export pattern for modules that expect it
module.exports.default = { createWebServer };
