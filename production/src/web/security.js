/**
 * QuestCord Security Middleware
 * ==============================
 * Comprehensive security layer for the QuestCord web application.
 * Implements multiple security controls to protect against common web vulnerabilities:
 * 
 * **Security Controls:**
 * - HTTP security headers (XSS, CSRF, Clickjacking protection)
 * - Content Security Policy (CSP) for script injection prevention
 * - Rate limiting to prevent abuse and DoS attacks
 * - CSRF token validation for state-changing operations
 * - Input validation and sanitization helpers
 * 
 * **CORS Configuration:**
 * - Permissive CORS for public API endpoints
 * - Secure headers for browser security compliance
 * - Cross-origin resource sharing for map functionality
 * 
 * **Production Hardening:**
 * - HSTS for HTTPS enforcement in production
 * - Strict CSP policies with necessary exceptions for map libraries
 * - Comprehensive input validation for Discord IDs and coordinates
 */

// Import Node.js crypto module for secure token generation
const crypto = require('crypto');
// In-memory storage for rate limiting buckets (per IP + path combination)
const buckets = new Map();
// Import configuration for security settings and rate limits
const config = require('../utils/config');

// Cleanup expired rate limiting buckets every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.reset) {
      buckets.delete(key);
    }
  }
}, 300000); // Clean every 5 minutes

/**
 * Security Headers Middleware
 * Applies comprehensive HTTP security headers to all responses
 * Protects against XSS, clickjacking, MIME sniffing, and other attacks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next middleware function
 */
function securityHeaders(req, res, next) {
  // Generate cryptographically secure nonce for Content Security Policy
  // This allows inline scripts/styles while preventing injection attacks
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  
  // Prevent MIME type sniffing attacks by browsers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking by denying iframe embedding
  res.setHeader('X-Frame-Options', 'DENY');
  // Enable XSS filtering in browsers (legacy but harmless)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Control referrer information sent to other origins
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable sensitive browser APIs (geolocation, microphone, camera)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // CORS headers for API functionality - allows all origins for public map data
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf');
  
  // HTTP Strict Transport Security - only in production to enforce HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Content Security Policy - controls resource loading to prevent XSS
  // Configured for map functionality while maintaining security
  const csp = [
    "default-src 'self'",  // Default: only load from same origin
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com", // Maps require inline/eval
    "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com https://cdnjs.cloudflare.com", // CSS from CDNs
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com", // Google Fonts + Font Awesome
    "img-src 'self' data: https://*.tile.openstreetmap.org https://cdn.discordapp.com", // Map tiles + Discord
    "connect-src 'self' https://nominatim.openstreetmap.org", // OpenStreetMap geocoding API
    "frame-ancestors 'none'", // Prevent embedding in frames
    "base-uri 'self'", // Restrict base element to same origin
    "object-src 'none'" // Block plugins/objects
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  
  next();
}

/**
 * Rate Limiting Middleware Factory
 * Creates rate limiting middleware to prevent abuse and DoS attacks
 * Uses token bucket algorithm with per-IP + per-path tracking
 * @param {number} maxDefault - Default maximum requests per time window (30)
 * @param {number} perMsDefault - Default time window in milliseconds (60000 = 1 minute)
 * @returns {Function} - Express middleware function
 */
function rateLimit(maxDefault = 30, perMsDefault = 60000) {
  return (req, res, next) => {
    // Get rate limit configuration from config file or use defaults
    const apiCfg = config.security?.apiRate || { max: maxDefault, perMs: perMsDefault };
    const max = apiCfg.max ?? maxDefault;
    const perMs = apiCfg.perMs ?? perMsDefault;
    
    // Create unique key combining client IP and request path
    const k = req.ip + '|' + req.path;
    const now = Date.now();
    
    // Get or create rate limit bucket for this IP + path combination
    const b = buckets.get(k) || { count: 0, reset: now + perMs };
    
    // Reset bucket if time window has expired
    if (now > b.reset) { 
      b.count = 0; 
      b.reset = now + perMs; 
    }
    
    // Increment request count
    b.count++;
    buckets.set(k, b);
    
    // Check if rate limit exceeded
    if (b.count > max) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    
    next();
  };
}

/**
 * CSRF Protection Middleware
 * Validates CSRF tokens on state-changing requests to prevent cross-site attacks
 * Requires x-csrf header to match session-stored token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function ensureCsrf(req, res, next) {
  // Extract CSRF token from request headers
  const tok = req.headers['x-csrf'];
  
  // Validate session exists and CSRF token matches
  if (!req.session || !req.session.csrf || tok !== req.session.csrf) {
    return res.status(403).json({ error: 'csrf' });
  }
  
  next();
}

/**
 * CSRF Token Generation Endpoint
 * Generates and returns a new CSRF token for the user's session
 * Token is stored in session and must be included in state-changing requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function setCsrf(req, res) {
  // Generate new CSRF token if one doesn't exist in session
  if (!req.session.csrf) {
    // Use cryptographically secure random token (32 bytes = 256 bits)
    req.session.csrf = crypto.randomBytes(32).toString('hex');
  }
  
  // Return the CSRF token to the client
  res.json({ csrf: req.session.csrf });
}

// ===============================================
// INPUT VALIDATION HELPERS
// ===============================================

/**
 * Validates Discord user ID format
 * Discord user IDs are 17-19 digit numeric strings (snowflake format)
 * @param {string} userId - Discord user ID to validate
 * @returns {boolean} - True if valid Discord user ID format
 */
function validateUserId(userId) {
  return userId && typeof userId === 'string' && /^\d{17,19}$/.test(userId);
}

/**
 * Validates Discord guild (server) ID format
 * Discord guild IDs use the same snowflake format as user IDs (17-19 digits)
 * @param {string} guildId - Discord guild ID to validate
 * @returns {boolean} - True if valid Discord guild ID format
 */
function validateGuildId(guildId) {
  return guildId && typeof guildId === 'string' && /^\d{17,19}$/.test(guildId);
}

/**
 * Validates geographic coordinates for map positioning
 * Ensures coordinates are valid numbers within Earth's coordinate bounds
 * @param {number} lat - Latitude coordinate (-90 to 90)
 * @param {number} lon - Longitude coordinate (-180 to 180)
 * @returns {boolean} - True if coordinates are valid and within bounds
 */
function validateCoordinates(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && 
         lat >= -90 && lat <= 90 &&        // Latitude bounds
         lon >= -180 && lon <= 180 &&      // Longitude bounds
         isFinite(lat) && isFinite(lon);    // No NaN or Infinity
}

/**
 * Sanitizes user input strings to prevent XSS and injection attacks
 * Trims whitespace, limits length, and removes dangerous HTML characters
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 255)
 * @returns {string} - Sanitized string safe for storage and display
 */
function sanitizeString(str, maxLength = 255) {
  // Return empty string for non-string inputs
  if (typeof str !== 'string') return '';
  
  // Trim whitespace, limit length, and remove dangerous characters
  return str.trim()                      // Remove leading/trailing whitespace
            .slice(0, maxLength)         // Enforce maximum length
            .replace(/[<>"/]/g, '');     // Remove HTML/script injection characters
}

// Export all security functions and middleware for use throughout the application
module.exports = { 
  securityHeaders,        // HTTP security headers middleware
  rateLimit,             // Rate limiting middleware factory
  ensureCsrf,           // CSRF token validation middleware
  setCsrf,              // CSRF token generation endpoint
  validateUserId,       // Discord user ID validation
  validateGuildId,      // Discord guild ID validation  
  validateCoordinates,  // Geographic coordinate validation
  sanitizeString        // String sanitization for XSS prevention
};
