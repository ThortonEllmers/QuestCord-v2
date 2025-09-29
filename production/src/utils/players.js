/**
 * PLAYER DATA AND VEHICLE MANAGEMENT MODULE
 * 
 * This module handles all player-related database operations and vehicle management:
 * - Player creation and initialization with default equipment
 * - Vehicle inventory management (commercial plane, premium jet)
 * - Premium status integration for vehicle access
 * - Equipment slot management and vehicle switching
 * 
 * Every player gets a commercial plane by default, and premium users gain access to
 * private jets with faster travel times and lower stamina costs.
 */

// Import database connection for player data operations
const { db } = require('./store_sqlite');
// Import premium status checking utility
const { isPremium } = require('./roles');

/**
 * ENSURE PLAYER EXISTS WITH VEHICLE SETUP
 * 
 * Creates a new player if they don't exist, or ensures existing player has proper
 * vehicle setup. Handles initial equipment setup and premium vehicle management.
 * This is the main entry point for player initialization in the game.
 * 
 * @param {Object} client - Discord bot client for premium role checking
 * @param {string} userId - Discord user ID of the player
 * @param {string} username - Discord username for display
 * @param {string|null} guildId - Server ID where player first spawns (optional)
 * @returns {Object} Player database record after initialization
 */
async function ensurePlayerWithVehicles(client, userId, username, guildId = null) {
  // Check if player already exists in the database
  let player = db.prepare('SELECT * FROM players WHERE userId=?').get(userId);
  
  if (!player) {
    /**
     * NEW PLAYER CREATION PROCESS
     * 
     * Creates a new player with default starting equipment and stats.
     * Every new player starts with full health/stamina and a commercial plane.
     * Defaults to spawn server if available and no specific guild provided.
     */
    
    // Determine starting location - prefer spawn server for new players
    let startingGuildId = guildId;
    if (!startingGuildId && process.env.SPAWN_GUILD_ID) {
      // No specific guild provided, check if spawn server exists and use it
      const spawnServer = db.prepare('SELECT guildId FROM servers WHERE guildId=? AND archived=0').get(process.env.SPAWN_GUILD_ID);
      if (spawnServer) {
        startingGuildId = process.env.SPAWN_GUILD_ID;
      }
    }
    
    // Create new player record with default starting values
    db.prepare(`
      INSERT INTO players(userId, name, locationGuildId, vehicle, health, stamina, drakari, travelArrivalAt) 
      VALUES(?, ?, ?, 'plane', 100, 100, 0, 0)
    `).run(userId, username, startingGuildId);
    
    // Add commercial plane to player's inventory (every player starts with one)
    db.prepare(`
      INSERT INTO inventory(userId, itemId, qty) VALUES(?, 'plane', 1)
    `).run(userId);
    
    // Equip the commercial plane as default vehicle in equipment slot
    db.prepare(`
      INSERT INTO equipment(userId, slot, itemId) VALUES(?, 'vehicle', 'plane')
    `).run(userId);
    
    // Retrieve the newly created player record for return
    player = db.prepare('SELECT * FROM players WHERE userId=?').get(userId);
  }
  
  /**
   * EXISTING PLAYER VEHICLE VALIDATION
   * 
   * Ensures existing players have the basic commercial plane in their inventory.
   * This handles cases where the inventory system was added after player creation.
   */
  
  // Check if player has commercial plane in inventory
  const hasPlane = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(userId, 'plane');
  if (!hasPlane) {
    // Add commercial plane if missing (for legacy players created before inventory system)
    db.prepare(`
      INSERT INTO inventory(userId, itemId, qty) VALUES(?, 'plane', 1)
    `).run(userId);
  }
  
  // Update premium vehicles based on current premium status
  await updatePremiumVehicles(client, userId);
  
  // Return the player record (either newly created or existing)
  return player;
}

/**
 * UPDATE PREMIUM VEHICLES BASED ON CURRENT STATUS
 * 
 * Dynamically manages premium vehicle access based on user's current premium status.
 * Grants private jets to premium users and removes them when premium expires.
 * Also handles equipment switching when premium vehicles are removed.
 * 
 * @param {Object} client - Discord bot client for premium role checking
 * @param {string} userId - Discord user ID to update vehicles for
 */
async function updatePremiumVehicles(client, userId) {
  // Check current premium status via Discord roles or database
  const userIsPremium = await isPremium(client, userId);
  // Check if user already has private jet in inventory
  const hasPrivateJet = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(userId, 'private_jet');
  
  if (userIsPremium && !hasPrivateJet) {
    /**
     * GRANT PREMIUM VEHICLE ACCESS
     * 
     * User is premium but doesn't have private jet yet.
     * Add private jet to their inventory.
     */
    db.prepare(`
      INSERT INTO inventory(userId, itemId, qty) VALUES(?, 'private_jet', 1)
    `).run(userId);
  } else if (!userIsPremium && hasPrivateJet) {
    /**
     * REVOKE PREMIUM VEHICLE ACCESS
     * 
     * User is no longer premium but still has private jet.
     * Remove private jet and handle equipment switching.
     */
    
    // Remove private jet from inventory
    db.prepare('DELETE FROM inventory WHERE userId=? AND itemId=?').run(userId, 'private_jet');
    
    // Check if they currently have private jet equipped
    const equippedVehicle = db.prepare('SELECT itemId FROM equipment WHERE userId=? AND slot=?').get(userId, 'vehicle');
    if (equippedVehicle && equippedVehicle.itemId === 'private_jet') {
      // Switch equipped vehicle back to commercial plane
      db.prepare('UPDATE equipment SET itemId=? WHERE userId=? AND slot=?').run('plane', userId, 'vehicle');
      // Update player record to reflect new vehicle
      db.prepare('UPDATE players SET vehicle=? WHERE userId=?').run('plane', userId);
    }
  }
}

/**
 * ENSURE DEFAULT VEHICLE EQUIPPED
 * 
 * Safety function that ensures a player always has a vehicle equipped.
 * If no vehicle is found in their equipment slots, automatically equips
 * the default commercial plane. This prevents players from getting stuck
 * without transportation.
 * 
 * @param {string} userId - Discord user ID to check and fix equipment for
 */
function ensureDefaultVehicle(userId) {
  // Check what vehicle is currently equipped in the vehicle slot
  const equippedVehicle = db.prepare('SELECT itemId FROM equipment WHERE userId=? AND slot=?').get(userId, 'vehicle');
  
  if (!equippedVehicle) {
    /**
     * NO VEHICLE EQUIPPED - APPLY DEFAULT
     * 
     * Player has no vehicle in equipment slot, which would prevent travel.
     * Equip default commercial plane and update player record.
     */
    
    // Equip commercial plane in vehicle slot (INSERT OR REPLACE handles existing slot)
    db.prepare(`
      INSERT OR REPLACE INTO equipment(userId, slot, itemId) VALUES(?, 'vehicle', 'plane')
    `).run(userId);
    
    // Update player record to reflect equipped vehicle
    db.prepare('UPDATE players SET vehicle=? WHERE userId=?').run('plane', userId);
  }
}

/**
 * MODULE EXPORTS
 * 
 * Export all player management functions for use by other modules.
 */
module.exports = {
  ensurePlayerWithVehicles,    // Main player initialization function
  updatePremiumVehicles,       // Premium vehicle access management
  ensureDefaultVehicle         // Safety function for vehicle equipment
};