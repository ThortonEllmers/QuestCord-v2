/**
 * LOGGING SYSTEM MODULE
 *
 * This module provides a comprehensive color-coded logging system for QuestCord with:
 * - Beautiful ANSI color coding for different log levels and categories
 * - Formatted timestamps and structured output
 * - Multiple log levels (info, warn, error, debug, success)
 * - Category-based coloring (bot, web, database, security, etc.)
 * - Cross-module compatibility with both CommonJS and ES modules
 *
 * The logging system helps track bot operations, errors, and important events
 * in the console with visual clarity through color coding.
 */

// Import Node.js util module for advanced string formatting
const util = require('util');

// ============================================================================
// ANSI COLOR CODES FOR TERMINAL OUTPUT
// ============================================================================
const colors = {
  // Basic colors
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Text colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright/bold colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// ============================================================================
// LOG LEVEL COLOR SCHEMES
// ============================================================================
const levelColors = {
  INFO: colors.brightCyan,
  WARN: colors.brightYellow,
  ERROR: colors.brightRed,
  DEBUG: colors.gray,
  SUCCESS: colors.brightGreen
};

// ============================================================================
// CATEGORY-BASED COLOR CODING
// ============================================================================
// Automatically detect and color-code log messages based on content
const categoryPatterns = [
  // Bot-related logs - Purple/Magenta
  { pattern: /\[bot\]/i, color: colors.brightMagenta },
  { pattern: /discord/i, color: colors.brightMagenta },
  { pattern: /logged in as/i, color: colors.brightMagenta },
  { pattern: /ClientReady/i, color: colors.brightMagenta },

  // Web server logs - Cyan
  { pattern: /\[web\]/i, color: colors.brightCyan },
  { pattern: /WEB SERVER/i, color: colors.brightCyan },
  { pattern: /express/i, color: colors.cyan },
  { pattern: /🌐/i, color: colors.brightCyan },

  // Database logs - Blue
  { pattern: /\[db\]/i, color: colors.brightBlue },
  { pattern: /\[Database\]/i, color: colors.brightBlue },
  { pattern: /sqlite/i, color: colors.blue },
  { pattern: /table/i, color: colors.blue },

  // Security logs - Red/Orange
  { pattern: /\[Security\]/i, color: colors.brightRed },
  { pattern: /security/i, color: colors.red },
  { pattern: /banned/i, color: colors.red },
  { pattern: /🚫|🔒|🛡️/i, color: colors.brightRed },

  // Route/API logs - Green
  { pattern: /\[routes\]/i, color: colors.brightGreen },
  { pattern: /mounted/i, color: colors.green },
  { pattern: /\[api\]/i, color: colors.green },

  // Config logs - Yellow
  { pattern: /\[Config\]/i, color: colors.brightYellow },
  { pattern: /configuration/i, color: colors.yellow },

  // Success indicators - Bright Green
  { pattern: /✅/i, color: colors.brightGreen },
  { pattern: /success/i, color: colors.brightGreen },
  { pattern: /completed/i, color: colors.green },

  // Boss/Game systems - Magenta
  { pattern: /\[Boss Spawner\]/i, color: colors.magenta },
  { pattern: /\[boss_spawner\]/i, color: colors.magenta },
  { pattern: /\[POI\]/i, color: colors.magenta },
  { pattern: /\[Boss Status\]/i, color: colors.magenta },
  { pattern: /boss_status/i, color: colors.magenta },

  // Notifications - Bright Cyan
  { pattern: /\[Bot Notifications\]/i, color: colors.brightCyan },
  { pattern: /\[BotNotifications\]/i, color: colors.brightCyan },
  { pattern: /notification/i, color: colors.cyan },

  // Timestamps - Gray (for separators and timestamps)
  { pattern: /━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━/i, color: colors.gray },

  // Deploy/Commands - Bright Green
  { pattern: /\[deploy\]/i, color: colors.brightGreen },
  { pattern: /deployed/i, color: colors.green },
  { pattern: /commands/i, color: colors.green },
  { pattern: /Putting (guild|GLOBAL) commands/i, color: colors.green },
  { pattern: /Done\./i, color: colors.brightGreen },

  // System processes - Cyan
  { pattern: /\[regen\]/i, color: colors.cyan },
  { pattern: /\[weekly-reset\]/i, color: colors.cyan },
  { pattern: /Batch regeneration/i, color: colors.cyan },
  { pattern: /reset system/i, color: colors.cyan },

  // Warnings and alerts - Yellow/Orange
  { pattern: /Warning:/i, color: colors.brightYellow },
  { pattern: /MemoryStore/i, color: colors.yellow },
  { pattern: /not designed for/i, color: colors.yellow },

  // Startup messages - Bright Green
  { pattern: /Starting/i, color: colors.brightGreen },
  { pattern: /started/i, color: colors.green },
  { pattern: /initialized/i, color: colors.green },
  { pattern: /ready/i, color: colors.brightGreen },

  // Shutdown messages - Bright Red
  { pattern: /shutdown/i, color: colors.brightRed },
  { pattern: /Received SIG/i, color: colors.red },
  { pattern: /Graceful shutdown/i, color: colors.red },
  { pattern: /closed/i, color: colors.red },

  // Water check - Cyan
  { pattern: /water check/i, color: colors.cyan },

  // IP addresses and ports - Gray
  { pattern: /IP:\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, color: colors.gray },
  { pattern: /Port:\s*\d+/i, color: colors.brightCyan },

  // HTTP Methods - Bright Cyan
  { pattern: /\b(GET|POST|PUT|DELETE|PATCH|OPTIONS)\s+\//i, color: colors.brightCyan },

  // Time durations - Gray
  { pattern: /\(\d+ms\)/i, color: colors.gray },
  { pattern: /\d+d\s+\d+h\s+\d+m/i, color: colors.gray },

  // Arrows and indicators - Bright Cyan
  { pattern: /^→/i, color: colors.brightCyan },

  // HTTP Status codes (must be near the end for priority)
  { pattern: /✅.*\b2\d{2}\b/i, color: colors.brightGreen },  // Success with checkmark
  { pattern: /\b2\d{2}\b/, color: colors.brightGreen },        // 2xx - Success
  { pattern: /\b3\d{2}\b/, color: colors.brightCyan },         // 3xx - Redirect
  { pattern: /\b4\d{2}\b/, color: colors.brightYellow },       // 4xx - Client Error
  { pattern: /\b5\d{2}\b/, color: colors.brightRed }           // 5xx - Server Error
];

/**
 * SMART COLOR DETECTION
 * Automatically applies appropriate colors based on log content
 *
 * @param {string} message - The log message to colorize
 * @param {string} baseColor - The base color for the log level
 * @returns {string} Colorized message
 */
function applySmartColors(message, baseColor) {
  // Find matching category pattern (check all patterns, prioritize first match)
  for (const { pattern, color } of categoryPatterns) {
    if (pattern.test(message)) {
      return color + message + colors.reset;
    }
  }

  // If no specific category matched, use bright white for visibility
  // This ensures ALL messages are colored and easy to read
  return colors.brightWhite + message + colors.reset;
}

/**
 * LOG MESSAGE FORMATTER WITH COLOR CODING
 *
 * Formats log messages with color-coded levels, timestamps, and content.
 * Uses Node.js util.format for printf-style string formatting with placeholders.
 *
 * @param {string} level - Log level string (INFO, WARN, ERROR, DEBUG, SUCCESS)
 * @param {Arguments} args - Arguments object from logging function call
 * @param {boolean} forceColor - Force specific color instead of smart detection
 * @param {boolean} skipTimestamp - Skip timestamp for separator lines
 * @returns {string} Formatted and colorized log message
 */
function fmt(level, args, forceColor = null, skipTimestamp = false) {
  // Format arguments using util.format (supports %s, %d, %j placeholders)
  const message = util.format.apply(null, args);

  // Get level color
  const levelColor = levelColors[level] || colors.white;

  // Color the level tag
  const coloredLevel = levelColor + `[${level}]` + colors.reset;

  // Apply smart coloring to the message content
  let coloredMessage;
  if (forceColor) {
    coloredMessage = forceColor + message + colors.reset;
  } else {
    coloredMessage = applySmartColors(message, colors.white);
  }

  // If skipTimestamp is true (for separator lines), omit the timestamp
  if (skipTimestamp) {
    return `${coloredLevel} ${coloredMessage}`;
  }

  // Generate ISO timestamp for consistent time formatting
  const ts = new Date().toISOString();

  // Color the timestamp in gray
  const coloredTimestamp = colors.gray + ts + colors.reset;

  // Return formatted log line with colored components
  return `${coloredLevel} ${coloredTimestamp} ${coloredMessage}`;
}

// Separator line for visual grouping
const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

// Track if we're currently in a grouped event block (between separators)
let inGroupedBlock = false;

/**
 * LOGGER OBJECT WITH MULTIPLE LOG LEVELS
 *
 * Provides color-coded logging functions for different severity levels.
 * Each log level has its own color scheme for easy visual identification.
 * ALL messages are wrapped with separator lines for consistent visual grouping.
 */
const loggerObj = {
  /**
   * INFO LEVEL LOGGING - Cyan
   *
   * For general information, status updates, and normal operation events.
   * Messages are automatically color-coded based on content.
   */
  info: function() {
    const message = util.format.apply(null, arguments);
    // Check if this is part of a grouped event (separator line or messages right after separator)
    const isSeparator = message.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // Always skip timestamp
    const line = fmt('INFO ', arguments, null, true);
    console.log(line);
  },

  /**
   * AQUA/HIGHLIGHT LEVEL LOGGING - Bright Cyan
   *
   * For important startup events and system status that should stand out visually.
   * Uses bright cyan color to differentiate from regular info logs.
   * Examples: server startup, major system events.
   */
  aqua: function() {
    const message = util.format.apply(null, arguments);
    const isSeparator = message.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Separator starts a grouped block
    if (isSeparator) {
      inGroupedBlock = !inGroupedBlock; // Toggle: separator ends current block or starts new one
    }

    // Always skip timestamp
    const line = fmt('INFO ', arguments, colors.brightCyan, true);
    console.log(line);
  },

  /**
   * SUCCESS LEVEL LOGGING - Bright Green
   *
   * For successful operations and positive confirmations.
   * Uses bright green to indicate successful completion.
   */
  success: function() {
    const message = util.format.apply(null, arguments);
    // Skip timestamp for separator lines
    const isSeparator = message.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // Always skip timestamp
    const line = fmt('INFO ', arguments, colors.brightGreen, true);
    console.log(line);
  },

  /**
   * WARN LEVEL LOGGING - Yellow
   *
   * For warning conditions that don't prevent operation but should be noted.
   * Examples: fallback usage, recoverable errors, deprecated features.
   */
  warn: function() {
    const message = util.format.apply(null, arguments);
    const isSeparator = message.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Separator starts a grouped block
    if (isSeparator) {
      inGroupedBlock = !inGroupedBlock;
    }

    // Always skip timestamp
    const line = fmt('WARN ', arguments, null, true);
    console.warn(line);
  },

  /**
   * ERROR LEVEL LOGGING - Red
   *
   * For error conditions that require attention.
   * Uses bright red color to make errors immediately visible.
   */
  error: function() {
    const message = util.format.apply(null, arguments);
    const isSeparator = message.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Separator starts a grouped block
    if (isSeparator) {
      inGroupedBlock = !inGroupedBlock;
    }

    // Always skip timestamp
    const line = fmt('ERROR', arguments, null, true);
    console.error(line);
  },

  /**
   * DEBUG LEVEL LOGGING - Gray
   *
   * For detailed debugging information during development.
   * Only outputs to console when DEBUG environment variable is set.
   */
  debug: function() {
    if (process.env.DEBUG) {
      const message = util.format.apply(null, arguments);
      // Skip timestamp for separator lines
      const isSeparator = message.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      // Always skip timestamp
      const line = fmt('DEBUG', arguments, null, true);
      console.debug(line);
    }
  }
};

/**
 * MODULE EXPORTS - CROSS-COMPATIBILITY SETUP
 *
 * Exports the logger in multiple formats to ensure compatibility with both
 * CommonJS (require) and ES modules (import) usage patterns.
 *
 * Usage examples:
 *   const logger = require('./logger'); logger.info('message');
 *   import logger from './logger'; logger.info('message');
 *   const { info, success } = require('./logger'); info('message');
 */

// Main export - the complete logger object
module.exports = loggerObj;

// ES module compatibility - default export
module.exports.default = loggerObj;

// Individual function exports for destructuring imports
module.exports.info = loggerObj.info;       // Information logging (cyan)
module.exports.aqua = loggerObj.aqua;       // Highlighted logging (bright cyan)
module.exports.success = loggerObj.success; // Success logging (bright green)
module.exports.warn = loggerObj.warn;       // Warning logging (yellow)
module.exports.error = loggerObj.error;     // Error logging (red)
module.exports.debug = loggerObj.debug;     // Debug logging (gray)

// Export colors for external use if needed
module.exports.colors = colors;
