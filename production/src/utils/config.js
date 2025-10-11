/**
 * CONFIGURATION LOADING AND MANAGEMENT MODULE
 * 
 * This module handles loading and merging configuration from multiple sources:
 * - Environment-specific .env files (.env.development, .env.production, etc.)
 * - JSON configuration files (config.json, config.development.json, etc.)
 * - Environment variables for sensitive data (Discord tokens, API keys, etc.)
 * 
 * The configuration system supports environment-specific overrides and merging,
 * allowing different settings for development, testing, and production environments.
 */

// Import Node.js file system operations for reading config files
const fs = require('fs');
// Import path utilities for cross-platform file path handling
const path = require('path');
// Import logger for configuration loading messages
const logger = require('./logger');

/**
 * ENVIRONMENT-SPECIFIC .env FILE LOADING
 * 
 * Loads environment variables from .env files based on NODE_ENV.
 * Tries environment-specific files first (e.g., .env.development), 
 * then falls back to default .env file if specific one doesn't exist.
 */

// Determine current environment, defaulting to 'production' for safety
const nodeEnv = process.env.NODE_ENV || 'production';
// Construct path to environment-specific .env file
const envPath = path.join(process.cwd(), `.env.${nodeEnv}`);

// Try to load environment-specific .env file first
if (fs.existsSync(envPath)) {
  // Load the environment-specific .env file (e.g., .env.development)
  require('dotenv').config({ path: envPath });
  logger.info(`[Config] Loaded environment file: .env.${nodeEnv}`);
} else {
  // Fall back to default .env file if environment-specific one doesn't exist
  require('dotenv').config();
  logger.info('[Config] Loaded default .env file');
}

/**
 * DEEP MERGE UTILITY FUNCTION
 * 
 * Recursively merges objects, allowing nested configuration override.
 * This enables environment-specific configs to override only specific nested properties
 * rather than replacing entire configuration sections.
 * 
 * @param {Object} target - The target object to merge into
 * @param {Object} src - The source object to merge from
 * @returns {Object} The merged target object
 */
function deepMerge(target, src){
  // Iterate through all properties in the source object
  for (const [k, v] of Object.entries(src || {})){
    // If the value is a non-null object (but not an array), merge recursively
    if (v && typeof v === 'object' && !Array.isArray(v)){
      // Ensure target has an object at this key to merge into
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      // Recursively merge nested objects
      deepMerge(target[k], v);
    } else if (v !== undefined){
      // For primitive values and arrays, directly assign the value
      target[k] = v;
    }
  }
  return target;
}

/**
 * SAFE JSON FILE READER
 * 
 * Attempts to read and parse a JSON file, returning empty object if file
 * doesn't exist or contains invalid JSON. This prevents crashes during
 * configuration loading when optional config files are missing.
 * 
 * @param {string} p - Path to JSON file to read
 * @returns {Object} Parsed JSON object or empty object if read/parse fails
 */
function readJsonSafe(p){
  try { 
    // Read file and parse as JSON
    return JSON.parse(fs.readFileSync(p, 'utf8')); 
  } catch { 
    // Return empty object if file doesn't exist or JSON is invalid
    return {}; 
  }
}

/**
 * JSON CONFIGURATION FILE LOADING
 * 
 * Loads configuration from JSON files, preferring environment-specific configs.
 * For example, in development mode it looks for config.development.json first,
 * then falls back to config.json if the specific file doesn't exist.
 */

// Get absolute path to application root directory
const root = path.resolve(process.cwd());

// Default configuration file path
let configPath = path.join(root, 'config.json');
// Environment-specific configuration file path (e.g., config.development.json)
const envConfigPath = path.join(root, `config.${nodeEnv}.json`);

// Check if environment-specific config file exists and use it if available
if (fs.existsSync(envConfigPath)) {
  // Use environment-specific config file
  configPath = envConfigPath;
  logger.info(`[Config] Loading environment-specific config: ${envConfigPath}`);
} else {
  // Fall back to default config file
  logger.info(`[Config] Loading default config: ${configPath}`);
}

// Load the chosen JSON configuration file safely
const jsonCfg = readJsonSafe(configPath);

/**
 * ENVIRONMENT VARIABLE OVERLAY CREATION
 * 
 * Creates an overlay object that maps environment variables to configuration structure.
 * This allows sensitive configuration (like API keys) to be provided via environment
 * variables while maintaining the same configuration object structure.
 */

// Reference to process.env for cleaner code
const env = process.env;

// Create configuration overlay from environment variables
const overlay = {
  // Web server configuration
  web: { 
    // Convert PORT string to number, undefined if not provided
    port: env.PORT ? Number(env.PORT) : undefined, 
    // Public base URL for external access
    publicBaseUrl: env.PUBLIC_BASE_URL 
  },
  
  // Authentication configuration (sensitive data from environment)
  auth: {
    // Discord OAuth configuration
    discord: {
      clientId: env.DISCORD_CLIENT_ID,           // Discord application client ID
      clientSecret: env.DISCORD_CLIENT_SECRET,   // Discord application client secret (sensitive)
      scope: env.DISCORD_SCOPE,                  // OAuth scopes requested
      prompt: env.DISCORD_PROMPT                 // OAuth prompt behavior
    },
    stateSecret: env.STATE_SECRET                // Secret for OAuth state parameter (sensitive)
  },
  
  // Billing/payment system configuration
  billing: { 
    paypal: { 
      environment: env.PAYPAL_ENV,               // PayPal environment (sandbox/live)
      clientId: env.PAYPAL_CLIENT_ID,            // PayPal client ID
      clientSecret: env.PAYPAL_CLIENT_SECRET,    // PayPal client secret (sensitive)
      webhookId: env.PAYPAL_WEBHOOK_ID           // PayPal webhook ID for payment notifications
    } 
  }
};

/**
 * CONFIGURATION MERGING AND FINALIZATION
 * 
 * Merges JSON configuration with environment variable overlay, ensuring
 * environment variables take precedence over JSON file settings.
 */

// Deep merge JSON config with environment overlay (env vars take precedence)
// Clone jsonCfg first to avoid modifying the original object
const cfg = deepMerge(JSON.parse(JSON.stringify(jsonCfg)), overlay);

// Ensure web configuration section exists
if (!cfg.web) cfg.web = {};

// Handle legacy PUBLIC_URL environment variable as fallback
if (!cfg.web.publicBaseUrl && env.PUBLIC_URL) cfg.web.publicBaseUrl = env.PUBLIC_URL;

// Export the final merged configuration object
module.exports = cfg;
