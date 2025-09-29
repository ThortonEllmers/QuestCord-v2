/**
 * DATABASE INITIALIZATION AND MANAGEMENT MODULE
 * 
 * This module handles all SQLite database operations for QuestCord, including:
 * - Environment-specific database file selection
 * - Database connection management with WAL mode for performance
 * - Core table creation and schema management
 * - Database migrations and column additions
 * - Table structure for servers, players, bosses, inventory, and all game features
 * 
 * The database uses better-sqlite3 for synchronous, high-performance SQLite operations.
 * Database files are separated by environment (dev, test, production) for isolation.
 */

// Import the better-sqlite3 library for synchronous SQLite database operations
const Database = require('better-sqlite3');
// Import path utilities for cross-platform file path handling
const path = require('path');

/**
 * ENVIRONMENT-SPECIFIC DATABASE PATH SELECTION
 * 
 * Determines which SQLite database file to use based on NODE_ENV environment variable.
 * This ensures development, testing, and production environments use separate databases,
 * preventing data contamination and allowing safe testing.
 * 
 * @returns {string} The absolute path to the appropriate SQLite database file
 */
const getDatabasePath = () => {
  // Get the current environment, defaulting to 'production' if not specified
  const env = process.env.NODE_ENV || 'production';
  
  // Return environment-specific database file path
  if (env === 'development') {
    // Development database - used during local development and testing
    return path.join(process.cwd(), 'data-dev.sqlite');
  } else if (env === 'test') {
    // Test database - used during automated testing to avoid affecting real data
    return path.join(process.cwd(), 'data-test.sqlite');
  } else {
    // Production database - used in live deployment
    return path.join(process.cwd(), 'data.sqlite');
  }
};

/**
 * DATABASE CONNECTION AND CONFIGURATION
 * 
 * Create the main database connection using the environment-appropriate file path.
 * Configure the database for optimal performance using WAL (Write-Ahead Logging) mode.
 */

// Create a new SQLite database connection using the determined file path
const db = new Database(getDatabasePath());

// Enable WAL (Write-Ahead Logging) mode for better concurrent read/write performance
// WAL mode allows multiple readers while a writer is active, improving performance
// in multi-user scenarios where the bot handles many simultaneous requests
db.pragma('journal_mode = WAL');

// Log which database file is being used for debugging and monitoring purposes
console.log(`[Database] Using database: ${getDatabasePath()}`);

/**
 * DATABASE HEALTH CHECK AND RECOVERY
 *
 * Check database integrity and attempt basic recovery if corruption is detected
 */
function checkDatabaseHealth() {
  try {
    // Run a basic integrity check
    const result = db.pragma('integrity_check');
    if (result && result.length > 0 && result[0].integrity_check !== 'ok') {
      console.error('[Database] Integrity check failed:', result);
      return false;
    }

    // Test basic connectivity with a simple query
    db.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    console.error('[Database] Health check failed:', error.message);
    if (error.code === 'SQLITE_CORRUPT') {
      console.error('[Database] Database corruption detected - attempting recovery...');
      try {
        // Attempt basic recovery
        db.pragma('wal_checkpoint(TRUNCATE)');
        console.log('[Database] WAL checkpoint completed');
        return false; // Still report as unhealthy after corruption
      } catch (recoveryError) {
        console.error('[Database] Recovery attempt failed:', recoveryError.message);
        return false;
      }
    }
    return false;
  }
}

// Perform initial health check
const isHealthy = checkDatabaseHealth();
if (!isHealthy) {
  console.warn('[Database] Warning: Database health check failed - some features may be unstable');
}

/**
 * CORE TABLE CREATION AND INITIALIZATION
 * 
 * Create all essential database tables if they don't already exist.
 * This includes tables for servers, players, bosses, inventory, and boss participants.
 * All table creation is wrapped in a try-catch to handle first-run scenarios gracefully.
 */
try {
  /**
   * SERVERS TABLE - Discord Guild/Server Registration
   * 
   * Stores information about Discord servers (guilds) that have registered with QuestCord.
   * Each server becomes a location in the game world with geographic coordinates.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      guildId TEXT PRIMARY KEY,        -- Discord guild ID (unique identifier)
      name TEXT,                       -- Discord server name for display
      lat REAL,                        -- Latitude coordinate for server location
      lon REAL,                        -- Longitude coordinate for server location
      ownerId TEXT,                    -- Discord user ID of server owner
      addedAt INTEGER,                 -- Unix timestamp when server was registered
      lastBossAt INTEGER DEFAULT 0,    -- Timestamp of last boss spawn for cooldown
      iconUrl TEXT,                    -- Discord server icon URL for display
      discoverable INTEGER DEFAULT 1,  -- Whether server appears in discovery (0/1 boolean)
      archived INTEGER DEFAULT 0,      -- Whether server is archived/inactive (0/1 boolean)
      archivedAt INTEGER,              -- Timestamp when server was archived
      archivedBy TEXT,                 -- User ID who archived the server
      biome TEXT,                      -- Environmental biome type (affects gameplay)
      tokens INTEGER DEFAULT 1,       -- Server tokens for premium features/unlocks
      isBanned INTEGER DEFAULT 0,      -- Whether server is banned (0/1 boolean)
      banReason TEXT,                  -- Reason for server ban if applicable
      bannedAt INTEGER                 -- Timestamp when server was banned
    )
  `);
  
  /**
   * PLAYERS TABLE - Player Profile and Game State
   * 
   * Stores all player data including location, resources, travel state, and statistics.
   * This is the central table for player progression and current game state.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      userId TEXT PRIMARY KEY,            -- Discord user ID (unique identifier)
      name TEXT,                          -- Discord username for display
      drakari INTEGER DEFAULT 0,          -- Primary game currency (coins/gold)
      locationGuildId TEXT,               -- Current server/location player is at
      travelArrivalAt INTEGER DEFAULT 0,  -- Timestamp when current travel completes
      travelFromGuildId TEXT,             -- Server ID where travel originated from
      travelStartAt INTEGER DEFAULT 0,    -- Timestamp when current travel began
      vehicle TEXT,                       -- Currently equipped vehicle (plane, jet, etc.)
      health INTEGER DEFAULT 100,         -- Current health points (0-100+ with bonuses)
      stamina INTEGER DEFAULT 100,        -- Current stamina points (0-100+ with bonuses)
      staminaUpdatedAt INTEGER DEFAULT 0, -- Last timestamp stamina was calculated
      gems INTEGER DEFAULT 0,             -- Premium currency for special purchases
      loginStreak INTEGER DEFAULT 0,      -- Consecutive days logged in for bonuses
      lastLoginAt INTEGER DEFAULT 0,      -- Timestamp of last daily login
      serversVisited INTEGER DEFAULT 0,   -- Total count of unique servers visited
      bossKills INTEGER DEFAULT 0,        -- Total boss fights participated in
      itemsCrafted INTEGER DEFAULT 0,     -- Total items crafted
      banned INTEGER DEFAULT 0,           -- Whether player is banned (0/1 boolean)
      banReason TEXT,                     -- Reason for ban if applicable
      bannedAt INTEGER                    -- Timestamp when player was banned
    )
  `);
  
  /**
   * BOSSES TABLE - Boss Fight Management
   * 
   * Stores active boss encounters that players can join and fight.
   * Bosses spawn at servers periodically and expire after a time limit.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS bosses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique boss encounter ID
      guildId TEXT,                         -- Server where boss spawned
      name TEXT,                            -- Boss creature name for display
      maxHp INTEGER,                        -- Boss maximum health points
      hp INTEGER,                           -- Current health remaining
      startedAt INTEGER,                    -- Timestamp when boss spawned
      expiresAt INTEGER,                    -- Timestamp when boss expires
      active INTEGER DEFAULT 1,             -- Whether boss is still active (0/1 boolean)
      tier INTEGER DEFAULT 1               -- Boss difficulty tier (affects rewards)
    )
  `);
  
  /**
   * INVENTORY TABLE - Player Item Storage
   * 
   * Stores all items owned by players with quantities.
   * Uses composite primary key to allow multiple item types per player.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      userId TEXT,                          -- Discord user ID who owns the items
      itemId TEXT,                          -- Unique identifier for item type
      qty INTEGER,                          -- Quantity of this item owned
      PRIMARY KEY (userId, itemId)         -- Composite key: one row per user-item pair
    )
  `);
  
  /**
   * BOSS PARTICIPANTS TABLE - Boss Fight Tracking
   * 
   * Records which players participated in each boss fight and tracks damage dealt.
   * Used for determining rewards and participation statistics.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS boss_participants (
      bossId INTEGER,                       -- Reference to boss encounter ID
      userId TEXT,                          -- Discord user ID of participant
      damage INTEGER DEFAULT 0,            -- Total damage dealt by this player
      PRIMARY KEY (bossId, userId)         -- Composite key: one row per boss-player pair
    )
  `);
  
  // Log successful completion of core table creation
  console.log('[db] Core tables initialized');
} catch (e) {
  // Log any errors during core table creation for debugging
  console.error('[db] Failed to create core tables:', e.message);
}

/**
 * LEGACY MIGRATION - Column Additions for Existing Databases
 * 
 * These ALTER TABLE statements add columns that were added after the initial release.
 * They use try-catch blocks because the columns might already exist in newer databases.
 * This ensures backward compatibility when updating existing QuestCord installations.
 */

// Add travel start timestamp column if it doesn't exist (for travel duration tracking)
try { db.exec('ALTER TABLE players ADD COLUMN travelStartAt INTEGER DEFAULT 0'); } catch (e) { }

// Add boss tier column if it doesn't exist (for difficulty-based rewards)
try { db.exec('ALTER TABLE bosses ADD COLUMN tier INTEGER'); } catch (e) { }

// Export the database connection for use by other modules
/**
 * SAFE DATABASE OPERATION WRAPPER
 *
 * Wraps database operations with corruption detection and error handling
 */
function safeDbOperation(operation, fallbackValue = null) {
  try {
    return operation();
  } catch (error) {
    if (error.code === 'SQLITE_CORRUPT' || error.message.includes('malformed')) {
      console.error('[Database] Corruption detected during operation - returning fallback');
      return fallbackValue;
    } else if (error.code === 'SQLITE_BUSY') {
      console.warn('[Database] Database busy - operation skipped');
      return fallbackValue;
    } else {
      throw error; // Re-throw other errors
    }
  }
}

module.exports = { db, logCommand, checkDatabaseHealth, safeDbOperation };

/**
 * DYNAMIC COLUMN EXISTENCE CHECKS AND ADDITIONS
 * 
 * The following sections check if specific columns exist in tables and add them if missing.
 * This handles database schema evolution gracefully without breaking existing installations.
 * Each section handles a specific feature set or update batch.
 */
/**
 * SERVER TOKENS COLUMN MANAGEMENT
 * 
 * Ensures the servers table has a 'tokens' column for premium server features.
 * Also handles migration from legacy 'biomeChangeTokens' if present.
 */
try {
  // Get list of all columns in the servers table using SQLite's PRAGMA command
  const cols = db.prepare("PRAGMA table_info(servers)").all().map(c => c.name);
  
  // Add tokens column if it doesn't exist - used for server-level premium features
  if (!cols.includes('tokens')) {
    // Add tokens column with default value of 1 (servers get one token by default)
    db.exec("ALTER TABLE servers ADD COLUMN tokens INTEGER DEFAULT 1");
    console.log('[db] Added servers.tokens');
  }
  
  // Legacy migration: convert old biomeChangeTokens to generic tokens system
  if (cols.includes('biomeChangeTokens')) {
    try {
      // Copy biomeChangeTokens value to tokens, using COALESCE to handle NULL values
      db.exec("UPDATE servers SET tokens = COALESCE(tokens, biomeChangeTokens, 1)");
      console.log('[db] Migrated biomeChangeTokens -> tokens');
    } catch (e) {
      // Log migration failures but don't stop the application
      console.warn('[db] Migration tokens from biomeChangeTokens failed:', e.message);
    }
  }
} catch (e) {
  // Log if the entire tokens column check/addition process fails
  console.warn('[db] Could not ensure tokens column:', e.message);
}

/**
 * SERVER BAN COLUMNS MANAGEMENT
 * 
 * Ensures the servers table has columns needed for server banning functionality.
 * This allows administrators to ban problematic servers from the network.
 */
try {
  // Get current list of server table columns (using cols2 to avoid variable conflict)
  const cols2 = db.prepare("PRAGMA table_info(servers)").all().map(c => c.name);
  
  // Add ban status column if it doesn't exist (boolean flag: 0 = not banned, 1 = banned)
  if (!cols2.includes('isBanned')) {
    db.exec("ALTER TABLE servers ADD COLUMN isBanned INTEGER DEFAULT 0");
    console.log('[db] Added servers.isBanned');
  }
  
  // Add ban reason column if it doesn't exist (text description of why server was banned)
  if (!cols2.includes('banReason')) {
    db.exec("ALTER TABLE servers ADD COLUMN banReason TEXT");
    console.log('[db] Added servers.banReason');
  }
  
  // Add ban timestamp column if it doesn't exist (when the ban was applied)
  if (!cols2.includes('bannedAt')) {
    db.exec("ALTER TABLE servers ADD COLUMN bannedAt INTEGER");
    console.log('[db] Added servers.bannedAt');
  }
} catch (e) {
  // Log if server ban column management fails
  console.warn('[db] Could not ensure ban columns:', e.message);
}

/**
 * PLAYER FEATURE COLUMNS MANAGEMENT
 * 
 * Ensures the players table has all columns needed for newer game features like:
 * - Premium gem currency system
 * - Daily login streaks and rewards  
 * - Achievement tracking statistics
 */
try {
  // Get list of all columns currently in the players table
  const playerCols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  
  // Add premium gems currency column if it doesn't exist
  if (!playerCols.includes('gems')) {
    // Gems are premium currency used for special purchases and shortcuts
    db.exec("ALTER TABLE players ADD COLUMN gems INTEGER DEFAULT 0");
    console.log('[db] Added players.gems');
  }
  
  // Add daily login streak tracking column if it doesn't exist
  if (!playerCols.includes('loginStreak')) {
    // Tracks consecutive days player has logged in (for daily rewards)
    db.exec("ALTER TABLE players ADD COLUMN loginStreak INTEGER DEFAULT 0");
    console.log('[db] Added players.loginStreak');
  }
  
  // Add last login timestamp column if it doesn't exist
  if (!playerCols.includes('lastLoginAt')) {
    // Tracks when player last claimed daily login rewards
    db.exec("ALTER TABLE players ADD COLUMN lastLoginAt INTEGER DEFAULT 0");
    console.log('[db] Added players.lastLoginAt');
  }
  
  // Add unique servers visited counter for achievement tracking
  if (!playerCols.includes('serversVisited')) {
    // Total number of different servers the player has visited
    db.exec("ALTER TABLE players ADD COLUMN serversVisited INTEGER DEFAULT 0");
    console.log('[db] Added players.serversVisited');
  }
  
  // Add total boss kills counter for achievement tracking
  if (!playerCols.includes('bossKills')) {
    // Total number of boss fights the player has participated in
    db.exec("ALTER TABLE players ADD COLUMN bossKills INTEGER DEFAULT 0");
    console.log('[db] Added players.bossKills');
  }
  
} catch (e) {
  // Log if player feature column management fails
  console.warn('[db] Could not ensure new feature columns:', e.message);
}

/**
 * ADVANCED FEATURE TABLES CREATION
 * 
 * Creates tables for advanced game features that were added after initial release.
 * These include waypoints, travel history, challenges, analytics, and more.
 * Each table serves a specific game mechanic or feature set.
 */
try {
  /**
   * WAYPOINTS TABLE - Player-created Travel Bookmarks
   * 
   * Allows players to save favorite locations for quick travel reference.
   * Players can name their waypoints and teleport to them later.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS waypoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique waypoint ID
      userId TEXT NOT NULL,                  -- Discord user who created waypoint
      name TEXT NOT NULL,                    -- Player-chosen name for waypoint
      guildId TEXT NOT NULL,                 -- Server ID that waypoint points to
      serverName TEXT,                       -- Cached server name for display
      createdAt INTEGER NOT NULL,            -- When waypoint was created
      UNIQUE(userId, name)                   -- Each user can only have one waypoint per name
    )
  `);
  console.log('[db] Ensured waypoints table exists');

  /**
   * TRAVEL HISTORY TABLE - Player Movement Tracking
   * 
   * Records all player travels between servers for statistics and analytics.
   * Tracks distance, time taken, and server names for analytics.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS travel_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique travel record ID
      userId TEXT NOT NULL,                  -- Player who traveled
      fromGuildId TEXT,                      -- Origin server (NULL for first spawn)
      toGuildId TEXT NOT NULL,               -- Destination server
      fromServerName TEXT,                   -- Cached origin server name
      toServerName TEXT,                     -- Cached destination server name
      travelTime INTEGER NOT NULL,           -- Travel duration in milliseconds
      timestamp INTEGER NOT NULL            -- When travel was completed
    )
  `);
  console.log('[db] Ensured travel_history table exists');


  /**
   * DAILY CHALLENGES TABLE - Daily Quest System
   * 
   * Tracks player progress on daily challenges that reset each day.
   * Players complete objectives to earn rewards and maintain engagement.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique challenge record ID
      userId TEXT NOT NULL,                  -- Player working on challenge
      challengeId TEXT NOT NULL,             -- Challenge type/identifier
      progress INTEGER DEFAULT 0,            -- Current progress toward target
      target INTEGER NOT NULL,               -- Required amount to complete
      completed INTEGER DEFAULT 0,           -- Whether challenge is completed (0/1)
      rewardClaimed INTEGER DEFAULT 0,       -- Whether reward was claimed (0/1)
      dateKey TEXT NOT NULL,                 -- Date string (YYYY-MM-DD) for daily reset
      UNIQUE(userId, challengeId, dateKey)   -- One challenge per user per day
    )
  `);
  console.log('[db] Ensured daily_challenges table exists');

  /**
   * BATTLE ANALYTICS TABLE - Combat Statistics Tracking
   * 
   * Records detailed combat data for analysis and balancing.
   * Tracks damage dealt, weapons used, and timing for each boss fight.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique analytics record ID
      userId TEXT NOT NULL,                  -- Player who participated in battle
      bossId INTEGER,                        -- Boss encounter ID (can be NULL)
      damage INTEGER NOT NULL,               -- Damage dealt in this battle
      weapon TEXT,                           -- Weapon used (for balancing analysis)
      timestamp INTEGER NOT NULL            -- When battle occurred
    )
  `);
  console.log('[db] Ensured battle_analytics table exists');

  /**
   * PREMIUM ITEMS TABLE - Premium Equipment Catalog
   * 
   * Stores definitions for premium items that can be purchased with gems.
   * Includes stats, descriptions, and pricing for premium equipment.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS premium_items (
      id TEXT PRIMARY KEY,               -- Unique item identifier
      name TEXT NOT NULL,                -- Item display name
      type TEXT NOT NULL,                -- Item category (weapon, armor, vehicle)
      rarity TEXT NOT NULL,              -- Rarity level (common, rare, legendary)
      damage INTEGER DEFAULT 0,          -- Damage bonus if applicable
      defense INTEGER DEFAULT 0,         -- Defense bonus if applicable
      description TEXT,                  -- Item description text
      price INTEGER DEFAULT 0,           -- Cost in gems
      premiumOnly INTEGER DEFAULT 1     -- Whether item requires premium (0/1)
    )
  `);
  console.log('[db] Ensured premium_items table exists');

  /**
   * GEM TRANSACTIONS TABLE - Premium Currency Audit Trail
   * 
   * Logs all gem transactions for accounting and fraud prevention.
   * Tracks purchases, rewards, and spending with full audit trail.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS gem_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique transaction ID
      userId TEXT NOT NULL,                  -- Player involved in transaction
      amount INTEGER NOT NULL,               -- Gem amount (positive = gained, negative = spent)
      type TEXT NOT NULL,                    -- Transaction type (purchase, reward, spend)
      description TEXT,                      -- Human-readable transaction description
      timestamp INTEGER NOT NULL            -- When transaction occurred
    )
  `);
  console.log('[db] Ensured gem_transactions table exists');

  /**
   * BANS TABLE - User Ban Management
   * 
   * Manages temporary and permanent user bans from the game.
   * Supports expiring bans and tracks ban reasons for moderation.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS bans (
      userId TEXT PRIMARY KEY,                            -- Discord user ID of banned player
      reason TEXT NOT NULL,                               -- Reason for ban (required)
      expiresAt INTEGER,                                   -- When ban expires (NULL = permanent)
      bannedAt INTEGER NOT NULL DEFAULT (UNIXEPOCH() * 1000) -- When ban was applied
    )
  `);
  console.log('[db] Ensured bans table exists');

  /**
   * PREMIUM USERS TABLE - Premium Subscription Management
   * 
   * Manages premium user status and subscriptions in database.
   * Alternative to Discord role-based premium status checking.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS premium_users (
      userId TEXT PRIMARY KEY,                            -- Discord user ID of premium user
      expiresAt INTEGER,                                   -- When premium expires (NULL = permanent)
      addedAt INTEGER NOT NULL DEFAULT (UNIXEPOCH() * 1000), -- When premium was granted
      addedBy TEXT,                                        -- Admin who granted premium
      notes TEXT                                           -- Additional notes about premium status
    )
  `);
  console.log('[db] Ensured premium_users table exists');

  /**
   * EQUIPMENT TABLE - Player Equipped Items
   * 
   * Tracks which items players have equipped in each equipment slot.
   * Supports multiple equipment slots (weapon, armor, vehicle, etc.).
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment (
      userId TEXT,                                         -- Player who equipped the item
      slot TEXT,                                           -- Equipment slot (weapon, armor, vehicle)
      itemId TEXT,                                         -- Item currently equipped in slot
      equippedAt INTEGER NOT NULL DEFAULT (UNIXEPOCH() * 1000), -- When item was equipped
      PRIMARY KEY (userId, slot)                          -- One item per slot per player
    )
  `);
  console.log('[db] Ensured equipment table exists');

  /**
   * MARKET LISTINGS TABLE - Player Trading System
   * 
   * Allows players to sell items to other players via marketplace.
   * Supports item listings with expiration times and pricing.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,        -- Unique listing ID
      sellerId TEXT NOT NULL,                       -- Player selling the item
      itemId TEXT NOT NULL,                         -- Item being sold
      qty INTEGER NOT NULL,                         -- Quantity being sold
      price INTEGER NOT NULL,                       -- Price in drakari (game currency)
      expiresAt INTEGER NOT NULL,                   -- When listing expires
      createdAt INTEGER NOT NULL DEFAULT (UNIXEPOCH() * 1000) -- When listing was created
    )
  `);
  console.log('[db] Ensured market_listings table exists');

  /**
   * POIs TABLE - Points of Interest (Famous Landmarks)
   * 
   * Stores famous real-world landmarks that players can visit.
   * Each POI has coordinates, description, and visit rewards.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS pois (
      id TEXT PRIMARY KEY,                  -- Unique POI identifier
      name TEXT NOT NULL,                   -- Landmark name (e.g., "Eiffel Tower")
      description TEXT,                     -- Description of the landmark
      lat REAL NOT NULL,                    -- Latitude coordinate
      lon REAL NOT NULL,                    -- Longitude coordinate
      country TEXT,                         -- Country where landmark is located
      category TEXT NOT NULL,               -- Category (monument, natural, etc.)
      emoji TEXT,                           -- Emoji icon for display
      discoveryReward INTEGER DEFAULT 100, -- Drakari reward for first visit
      visitCost INTEGER DEFAULT 50,        -- Stamina cost to visit
      createdAt INTEGER NOT NULL           -- When POI was added to database
    )
  `);
  console.log('[db] Ensured pois table exists');

  /**
   * POI VISITS TABLE - Landmark Visit Tracking
   * 
   * Tracks which players have visited which landmarks.
   * Prevents duplicate rewards for POI visits.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS poi_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique visit record ID
      userId TEXT NOT NULL,                  -- Player who visited the POI
      poiId TEXT NOT NULL,                   -- POI that was visited
      visitedAt INTEGER NOT NULL,            -- Timestamp of visit
      isFirstVisit INTEGER DEFAULT 0,       -- Whether this was player's first visit (0/1)
      UNIQUE(userId, poiId),                 -- One record per user-POI pair
      FOREIGN KEY (poiId) REFERENCES pois(id) -- Ensure POI exists
    )
  `);
  console.log('[db] Ensured poi_visits table exists');

} catch (e) {
  // Log if advanced feature table creation fails
  console.warn('[db] Could not create new feature tables:', e.message);
}

/**
 * COMMAND LOGS TABLE - Live Command Activity Tracking
 *
 * Stores real-time command usage across all servers for the live activity widget.
 * Tracks who ran what command where and when for display on the website.
 */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,             -- Discord user ID who ran the command
      command TEXT NOT NULL,            -- Command name (without slash prefix)
      guildId TEXT,                     -- Discord guild ID where command was run
      timestamp INTEGER NOT NULL       -- Unix timestamp when command was executed
    )
  `);

  // Create index for efficient querying of recent commands
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_command_logs_timestamp
    ON command_logs(timestamp DESC)
  `);

  console.log('[db] Ensured command_logs table exists');
} catch (e) {
  console.warn('[db] Could not create command_logs table:', e.message);
}

/**
 * COMMAND LOGGING UTILITIES
 *
 * Helper functions for logging command usage for live activity tracking
 */

/**
 * Log a command execution for live activity display
 * @param {string} userId - Discord user ID who ran the command
 * @param {string} command - Command name (without slash prefix)
 * @param {string} guildId - Discord guild ID where command was run
 */
function logCommand(userId, command, guildId) {
  try {
    // Ensure the player exists before logging command
    db.prepare(`
      INSERT OR IGNORE INTO players (userId, name)
      VALUES (?, ?)
    `).run(userId, 'Unknown User');

    // Insert the command log entry
    db.prepare(`
      INSERT INTO command_logs (userId, command, guildId, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(userId, command, guildId, Date.now());

    // Clean up old entries (keep only last 24 hours)
    db.prepare(`
      DELETE FROM command_logs
      WHERE timestamp < ?
    `).run(Date.now() - 86400000); // 24 hours ago

  } catch (error) {
    if (error.code === 'SQLITE_CORRUPT' || error.message.includes('malformed')) {
      console.error('[db] Database corruption detected during command logging:', error.message);
      // Don't attempt any further database operations when corrupted
      return;
    } else if (error.code === 'SQLITE_BUSY') {
      console.warn('[db] Database busy during command logging - command not logged:', error.message);
      return;
    } else if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      console.warn('[db] Foreign key constraint during command logging:', error.message);
      return;
    } else {
      console.warn('[db] Failed to log command:', error.message);
    }
  }
}


