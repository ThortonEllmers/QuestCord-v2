/**
 * LOGGING SYSTEM MODULE
 *
 * This module provides a comprehensive logging system for QuestCord with:
 * - Standard console logging with formatted timestamps and levels
 * - Multiple log levels (info, warn, error, debug)
 * - Color-coded console output for better readability
 * - Cross-module compatibility with both CommonJS and ES modules
 *
 * The logging system helps track bot operations, errors, and important events
 * in the console. All Discord notifications are handled by bot_notifications.js.
 */

// Import Node.js util module for advanced string formatting
const util = require('util');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  aqua: '\x1b[96m',  // Bright cyan/aqua
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

/**
 * LOG MESSAGE FORMATTER
 * 
 * Formats log messages with consistent structure including level, timestamp, and content.
 * Uses Node.js util.format for printf-style string formatting with placeholders.
 * 
 * @param {string} level - Log level string (INFO, WARN, ERROR, DEBUG)
 * @param {Arguments} args - Arguments object from logging function call
 * @returns {string} Formatted log message with timestamp
 */
function fmt(level, args) {
  // Generate ISO timestamp for consistent time formatting
  const ts = new Date().toISOString();
  // Format arguments using util.format (supports %s, %d, %j placeholders)
  const line = util.format.apply(null, args);
  // Return formatted log line with level and timestamp
  return `[${level}] ${ts} ${line}`;
}


/**
 * LOGGER OBJECT WITH MULTIPLE LOG LEVELS
 *
 * Provides standard logging functions with console output.
 * Discord notifications are handled separately by bot_notifications.js.
 */
const loggerObj = {
  /**
   * INFO LEVEL LOGGING
   *
   * For general information, status updates, and normal operation events.
   * Outputs to console.
   */
  info: function() {
    // Format message with INFO level
    const line = fmt('INFO ', arguments);
    // Output to console using appropriate method
    console.log(line);
  },

  /**
   * AQUA LEVEL LOGGING
   *
   * For important startup events and system status that should stand out visually.
   * Uses bright cyan/aqua color to differentiate from regular info logs.
   * Examples: server startup, configuration loaded, major system events.
   */
  aqua: function() {
    // Format message with INFO level (same structure as info)
    const line = fmt('INFO ', arguments);
    // Output to console with aqua/cyan color highlighting
    console.log(colors.aqua + line + colors.reset);
  },

  /**
   * WARN LEVEL LOGGING
   *
   * For warning conditions that don't prevent operation but should be noted.
   * Examples: fallback usage, recoverable errors, deprecated features.
   */
  warn: function() {
    // Format message with WARN level
    const line = fmt('WARN ', arguments);
    // Output to console using warning method (may use different color)
    console.warn(line);
  },

  /**
   * ERROR LEVEL LOGGING
   *
   * For error conditions that require attention but don't crash the application.
   */
  error: function() {
    // Format message with ERROR level
    const line = fmt('ERROR', arguments);
    // Output to console using error method (typically red color)
    console.error(line);
  },

  /**
   * DEBUG LEVEL LOGGING
   *
   * For detailed debugging information during development.
   * Only outputs to console when DEBUG environment variable is set.
   */
  debug: function() {
    // Format message with DEBUG level
    const line = fmt('DEBUG', arguments);
    // Only output if DEBUG environment variable is enabled
    if (process.env.DEBUG) console.debug(line);
  }
};

/**
 * MODULE EXPORTS - CROSS-COMPATIBILITY SETUP
 * 
 * Exports the logger in multiple formats to ensure compatibility with both
 * CommonJS (require) and ES modules (import) usage patterns.
 * This allows the logger to be used flexibly across the codebase.
 * 
 * Usage examples:
 *   const logger = require('./logger'); logger.info('message');
 *   import logger from './logger'; logger.info('message');
 *   const { info } = require('./logger'); info('message');
 */

// Main export - the complete logger object
module.exports = loggerObj;

// ES module compatibility - default export
module.exports.default = loggerObj;

// Individual function exports for destructuring imports
module.exports.info = loggerObj.info;   // Information logging
module.exports.aqua = loggerObj.aqua;   // Aqua/cyan highlighted logging
module.exports.warn = loggerObj.warn;   // Warning logging
module.exports.error = loggerObj.error; // Error logging
module.exports.debug = loggerObj.debug; // Debug logging
