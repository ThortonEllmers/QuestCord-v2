/**
 * QuestCord Web Utilities
 * ========================
 * Core utility functions for the QuestCord web interface.
 * This module provides essential helper functions used across
 * the web routes and API endpoints.
 * 
 * **Core Functionality:**
 * - Player management and database operations
 * - Discord server auto-placement on the interactive map
 * - Role-based permission system integration
 * - Geographic coordinate management
 * - Biome assignment for new servers
 * 
 * **Integration Points:**
 * - Discord API for role and member information
 * - SQLite database for persistent data storage
 * - Geographic utilities for land detection and positioning
 * - Configuration system for biome and role management
 * 
 * All functions handle errors gracefully and provide fallback behavior
 * to ensure the web interface remains functional even with partial failures.
 */

// Import SQLite database connection for data persistence
const { db } = require('../utils/store_sqlite');
// Import geographic utilities for server placement and land detection
const { placeOnSpiral, findLandPosition } = require('../utils/geo');
// Import configuration settings for biomes, roles, and other customization
const config = require('../utils/config');

/**
 * Cross-platform HTTP fetch helper for Discord API calls
 * Provides compatibility between different Node.js versions by using
 * global fetch when available (Node 18+) or falling back to node-fetch
 * @param {...any} args - Arguments to pass to the fetch function
 * @returns {Promise} - HTTP response promise
 */
async function fetchSafe(...args){
  // Use native fetch if available (Node 18+ or modern environments)
  if (typeof globalThis.fetch === 'function') return globalThis.fetch(...args);
  // Dynamically import node-fetch for older Node versions (ESM module)
  const mod = await import('node-fetch');
  return mod.default(...args);
}

// ===============================================
// CORE HELPER FUNCTIONS
// ===============================================

/**
 * Retrieves the designated spawn server from the database
 * The spawn server is where new players begin their journey on the interactive map
 * @returns {Object|null} - Spawn server object from database or null if not configured
 */
function getSpawnServer(){
  // Get the spawn server ID from environment configuration
  const id = process.env.SPAWN_GUILD_ID;
  if (!id) return null;
  // Query the database for the spawn server details
  return db.prepare('SELECT * FROM servers WHERE guildId=?').get(id);
}

/**
 * Ensures a player record exists in the database for the given user
 * Creates a new player record if one doesn't exist, with default starting values
 * All new players spawn at the designated spawn server location
 * @param {Object} user - Discord user object containing id and username
 */
function ensurePlayerRow(user){
  // Validate user object has required properties
  if (!user || !user.id) return;
  
  // Check if player already exists in the database
  const row = db.prepare('SELECT userId FROM players WHERE userId=?').get(user.id);
  if (row) return; // Player already exists, nothing to do
  
  // Get spawn location from environment configuration
  const spawnGuildId = process.env.SPAWN_GUILD_ID || null;
  
  // Create new player record with default starting values:
  // - 0 drakari (in-game currency)
  // - Located at spawn server
  // - Not currently traveling (NULL arrival time)
  // - Default vehicle is plane
  // - Full health and stamina (100 each)
  db.prepare(`INSERT INTO players (userId, name, drakari, locationGuildId, travelArrivalAt, vehicle, health, stamina)
              VALUES (?, ?, 0, ?, NULL, 'plane', 100, 100)`)
    .run(user.id, user.username || 'adventurer', spawnGuildId);
}

/**
 * Assigns a biome to a Discord server based on its guild ID
 * Uses deterministic hashing to ensure the same server always gets the same biome
 * This provides consistent visual theming on the interactive map
 * @param {string} guildId - Discord guild ID to assign biome for
 * @returns {string} - Biome name (e.g., 'forest', 'mountain', 'volcanic')
 */
function assignBiomeDeterministic(guildId){
  try{
    // Get available biomes from configuration or use default set
    const biomes = (config && config.biomes) ? Object.keys(config.biomes) : [
      'volcanic','ruins','swamp','water','forest','ice','meadow','mountain'
    ];
    
    // Return default biome if no guild ID or no biomes available
    if (!guildId || biomes.length === 0) return 'meadow';
    
    // Use FNV-1a hash algorithm for deterministic biome selection
    // This ensures the same guild ID always produces the same biome
    let h = 2166136261; // FNV offset basis (32-bit)
    for (let i=0;i<guildId.length;i++){ 
      h ^= guildId.charCodeAt(i);        // XOR with character code
      h = Math.imul(h, 16777619) >>> 0;  // Multiply by FNV prime, keep 32-bit
    }
    
    // Map hash to biome index
    const idx = h % biomes.length;
    return biomes[idx];
  }catch(e){
    // Return safe default biome if any error occurs
    return 'meadow';
  }
}

/**
 * Automatically creates and places a Discord server on the interactive map
 * Uses spiral placement algorithm to distribute servers evenly across the map
 * Ensures all servers are placed on land (not in water) using geographic validation
 * @param {Object} options - Server creation options
 * @param {string} options.guildId - Discord guild ID (required)
 * @param {string} options.name - Server display name (optional)
 * @param {string} options.ownerId - Discord ID of server owner (optional)
 * @param {string} options.iconUrl - URL to server icon image (optional)
 */
async function createAutoPlacementIfMissing({ guildId, name, ownerId, iconUrl } = {}){
  // Validate required guild ID parameter
  if (!guildId) return;
  
  // Check if server already exists in database
  const existing = db.prepare('SELECT guildId FROM servers WHERE guildId=?').get(guildId);
  if (existing) return; // Server already exists, nothing to do

  console.log(`Creating server ${guildId} - searching for land position...`);
  
  // Get current server count to determine placement position in spiral
  const count = db.prepare('SELECT COUNT(*) AS c FROM servers').get().c || 0;
  
  // Calculate next position on the spiral pattern (evenly distributes servers)
  const spiralPos = placeOnSpiral(count + 1, { lat: 0, lon: 0 });
  
  // Find the nearest land position from the spiral position
  // This ensures servers aren't placed in water on the map
  const pos = await findLandPosition(spiralPos.lat, spiralPos.lon);
  console.log(`Server ${guildId} placed at land position: ${pos.lat}, ${pos.lon}`);
  
  // Assign a deterministic biome based on the guild ID
  const biome = assignBiomeDeterministic(guildId);
  
  // Insert the new server into the database with:
  // - Geographic coordinates on land
  // - Creation timestamp
  // - No boss battles initially (lastBossAt = 0)
  // - Discoverable by default
  // - All provided metadata (name, owner, icon)
  db.prepare(`INSERT INTO servers (guildId, name, lat, lon, ownerId, addedAt, lastBossAt, iconUrl, discoverable)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)`)
    .run(guildId, name || 'New Server', pos.lat, pos.lon, ownerId || null, Date.now(), iconUrl || null);
}

// ===============================================
// ROLE AND PERMISSION MANAGEMENT
// ===============================================

/**
 * Retrieves Discord role IDs for a specific user in the configured guild
 * Used for determining user permissions and access levels
 * @param {string} userId - Discord user ID to fetch roles for
 * @returns {Array<string>} - Array of Discord role IDs, empty array if error
 */
async function getMemberRoleIds(userId){
  try{
    // Use role guild if specified, otherwise fall back to spawn guild
    const guildId = process.env.ROLE_GUILD_ID || process.env.SPAWN_GUILD_ID;
    if (!guildId) return [];
    
    // Make Discord API call to get guild member information
    const r = await fetchSafe(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
    });
    
    // Return empty array if API call fails
    if (!r.ok) return [];
    
    // Parse response and extract roles array
    const m = await r.json();
    return Array.isArray(m.roles) ? m.roles : [];
  }catch(e){
    // Return empty array if any error occurs (network, parsing, etc.)
    return [];
  }
}

/**
 * Determines the role level/permission tier for a user
 * Checks Discord roles first, then falls back to database premium status
 * Role hierarchy: Developer > Staff > Premium > User
 * @param {string} userId - Discord user ID to check role level for
 * @returns {string} - Role level ('Developer', 'Staff', 'Premium', or 'User')
 */
async function fetchRoleLevel(userId){
  try{
    // Get user's Discord role IDs
    const roles = await getMemberRoleIds(userId);
    
    // Parse role ID lists from environment variables
    const dev = (process.env.DEV_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
    const staff = (process.env.STAFF_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
    const premium = (process.env.PREMIUM_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
    
    // Check role hierarchy (highest first)
    if (roles.some(id=>dev.includes(id))) return 'Developer';
    if (roles.some(id=>staff.includes(id))) return 'Staff';
    if (roles.some(id=>premium.includes(id))) return 'Premium';
    
    // Database fallback for premium users (in case Discord role is missing)
    const row = db.prepare('SELECT 1 FROM premium_users WHERE userId=?').get(userId);
    return row ? 'Premium' : 'User';
  }catch(e){
    // If Discord API fails, check database for premium status only
    const row = db.prepare('SELECT 1 FROM premium_users WHERE userId=?').get(userId);
    return row ? 'Premium' : 'User';
  }
}

// Export all utility functions for use in web routes and API endpoints
module.exports = {
  getSpawnServer,                    // Retrieve designated spawn server information
  ensurePlayerRow,                   // Create player database record if needed
  assignBiomeDeterministic,          // Assign consistent biome to servers
  createAutoPlacementIfMissing,      // Auto-place new servers on map
  getMemberRoleIds,                  // Fetch Discord role IDs for user
  fetchRoleLevel                     // Determine user permission level
};
