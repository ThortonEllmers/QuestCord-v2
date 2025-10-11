/**
 * Configuration Validation Module
 *
 * Validates all required configuration values at startup to ensure
 * the application has everything it needs to run properly.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Configuration validation rules
 */
const VALIDATION_RULES = {
  // Discord Bot Configuration (Critical)
  'auth.discord.clientId': {
    required: true,
    type: 'string',
    description: 'Discord application client ID',
    source: 'DISCORD_CLIENT_ID environment variable'
  },
  'auth.discord.clientSecret': {
    required: true,
    type: 'string',
    description: 'Discord application client secret',
    source: 'DISCORD_CLIENT_SECRET environment variable'
  },

  // Web Server Configuration
  'web.port': {
    required: false,
    type: 'number',
    default: 3001,
    description: 'Web server port'
  },
  'web.publicBaseUrl': {
    required: false,
    type: 'string',
    description: 'Public base URL for external access',
    source: 'PUBLIC_BASE_URL environment variable or config.json'
  },

  // Boss System Configuration
  'boss.baseHp': {
    required: true,
    type: 'number',
    description: 'Base HP for boss spawning',
    min: 100
  },
  'boss.maxActiveGlobal': {
    required: true,
    type: 'number',
    description: 'Maximum active bosses globally',
    min: 1,
    max: 10
  },
  'boss.ttlSeconds': {
    required: true,
    type: 'number',
    description: 'Boss time-to-live in seconds',
    min: 300
  },

  // Authentication
  'auth.stateSecret': {
    required: false,
    type: 'string',
    description: 'OAuth state secret',
    source: 'STATE_SECRET environment variable'
  }
};

/**
 * Get nested property value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Validate a single configuration value
 */
function validateConfigValue(config, key, rule) {
  const value = getNestedValue(config, key);
  const errors = [];

  // Check if required value is missing
  if (rule.required && (value === undefined || value === null || value === '')) {
    errors.push({
      key,
      error: 'MISSING_REQUIRED',
      message: `Required configuration "${key}" is missing`,
      description: rule.description,
      source: rule.source || 'config.json'
    });
    return errors;
  }

  // If value is not present but not required, skip further validation
  if (value === undefined || value === null) {
    return errors;
  }

  // Type validation
  if (rule.type && typeof value !== rule.type) {
    errors.push({
      key,
      error: 'INVALID_TYPE',
      message: `Configuration "${key}" must be of type ${rule.type}, got ${typeof value}`,
      description: rule.description,
      value: value
    });
  }

  // Numeric range validation
  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      errors.push({
        key,
        error: 'VALUE_TOO_LOW',
        message: `Configuration "${key}" must be at least ${rule.min}, got ${value}`,
        description: rule.description,
        value: value
      });
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.push({
        key,
        error: 'VALUE_TOO_HIGH',
        message: `Configuration "${key}" must be at most ${rule.max}, got ${value}`,
        description: rule.description,
        value: value
      });
    }
  }

  // String length validation
  if (rule.type === 'string' && typeof value === 'string') {
    if (rule.minLength && value.length < rule.minLength) {
      errors.push({
        key,
        error: 'STRING_TOO_SHORT',
        message: `Configuration "${key}" must be at least ${rule.minLength} characters long`,
        description: rule.description
      });
    }
  }

  return errors;
}

/**
 * Validate the entire configuration object
 */
function validateConfiguration(config) {
  logger.info('[Config Validator] Starting configuration validation...');

  const errors = [];
  const warnings = [];

  // Validate each rule
  for (const [key, rule] of Object.entries(VALIDATION_RULES)) {
    const validationErrors = validateConfigValue(config, key, rule);
    errors.push(...validationErrors);
  }

  // Check for common configuration issues

  // Discord token environment variable (not in config file for security)
  if (!process.env.DISCORD_TOKEN) {
    errors.push({
      key: 'DISCORD_TOKEN',
      error: 'MISSING_REQUIRED',
      message: 'DISCORD_TOKEN environment variable is required',
      description: 'Discord bot token for authentication',
      source: 'DISCORD_TOKEN environment variable'
    });
  }

  // Web URL configuration warning
  const webUrl = getNestedValue(config, 'web.publicBaseUrl');
  if (webUrl && (webUrl.includes('localhost') || webUrl.includes('127.0.0.1'))) {
    warnings.push({
      key: 'web.publicBaseUrl',
      warning: 'LOCALHOST_URL',
      message: 'Web URL appears to be localhost - this may not work in production',
      value: webUrl
    });
  }

  // Database file check
  const dbPath = path.join(process.cwd(), 'data.sqlite');
  if (!fs.existsSync(dbPath)) {
    warnings.push({
      key: 'database',
      warning: 'DATABASE_MISSING',
      message: 'SQLite database file (data.sqlite) not found - will be created on first run',
      description: 'This is normal for first-time setup'
    });
  }

  return { errors, warnings };
}

/**
 * Format and display validation results
 */
function displayValidationResults(errors, warnings) {
  if (errors.length === 0 && warnings.length === 0) {
    logger.info('[Config Validator] ✅ Configuration validation passed!');
    return true;
  }

  // Display errors
  if (errors.length > 0) {
    logger.error('\n[Config Validator] ❌ Configuration Errors Found:');
    logger.error('=====================================');

    errors.forEach((error, index) => {
      logger.error(`\n${index + 1}. ${error.message}`);
      if (error.description) {
        logger.error(`   Description: ${error.description}`);
      }
      if (error.source) {
        logger.error(`   Source: ${error.source}`);
      }
      if (error.value !== undefined) {
        logger.error(`   Current Value: ${error.value}`);
      }
    });

    logger.error('\n📖 Please refer to .env.example for proper configuration setup.');
  }

  // Display warnings
  if (warnings.length > 0) {
    logger.warn('\n[Config Validator] ⚠️  Configuration Warnings:');
    logger.warn('=====================================');

    warnings.forEach((warning, index) => {
      logger.warn(`\n${index + 1}. ${warning.message}`);
      if (warning.description) {
        logger.warn(`   Note: ${warning.description}`);
      }
      if (warning.value !== undefined) {
        logger.warn(`   Current Value: ${warning.value}`);
      }
    });
  }

  return errors.length === 0;
}

/**
 * Main validation function
 */
function validateStartupConfiguration(config) {
  try {
    const { errors, warnings } = validateConfiguration(config);
    const isValid = displayValidationResults(errors, warnings);

    if (!isValid) {
      logger.error('\n[Config Validator] 🛑 Cannot start application with configuration errors.');
      logger.error('Please fix the above issues and restart the application.\n');
      process.exit(1);
    }

    if (warnings.length > 0) {
      logger.warn('\n[Config Validator] ⚠️  Application will start despite warnings, but please review them.');
    } else {
      logger.info('[Config Validator] ✅ All configuration checks passed!');
    }

    return true;
  } catch (error) {
    logger.error('[Config Validator] Error during validation:', error.message);
    return false;
  }
}

module.exports = {
  validateStartupConfiguration,
  validateConfiguration,
  VALIDATION_RULES
};