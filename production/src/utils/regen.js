/**
 * HEALTH/STAMINA REGENERATION AND TRAVEL COMPLETION MODULE
 * 
 * This module manages the core regeneration system for QuestCord, handling:
 * - Automatic health and stamina regeneration over time
 * - Travel completion when arrival times are reached
 * - Location-based regeneration modifiers (biome effects)
 * - Activity penalties (recent travel, combat) affecting regen rates
 * - Premium user bonuses for faster regeneration and higher maximums
 * - Item-based temporary regeneration effects and buffs
 * - Landmark visit processing and Point of Interest (POI) interactions
 * - Batch processing for efficient server-wide regeneration updates
 * 
 * The regeneration system uses time-based calculations to provide consistent
 * healing and stamina recovery regardless of when players check their status.
 */

// Import database connection for player data operations
const { db } = require('./store_sqlite');
// Import travel history recording functionality
const { recordTravel } = require('./travel_history');

/**
 * CONFIGURATION LOADING AND CONSTANTS
 * 
 * Load regeneration settings from config file with fallback defaults.
 * These constants define base regeneration rates and maximum values.
 */

// Attempt to load main config file, fall back to empty object if missing
let config = {};
try { 
  config = require('../../config.json'); 
} catch { 
  config = {}; 
}

// Extract regeneration-specific configuration section
const regenConfig = config.regen || {};

// Define base regeneration constants with config overrides
const MAX_H = regenConfig.maxHealth || 100;              // Base maximum health points
const MAX_S = regenConfig.maxStamina || 100;             // Base maximum stamina points  
const BASE_HPM = regenConfig.baseHealthPerMinute || 2;   // Base health points per minute
const BASE_SPM = regenConfig.baseStaminaPerMinute || 3;  // Base stamina points per minute

/**
 * UTILITY FUNCTION - VALUE CLAMPING
 * 
 * Clamps a numeric value between minimum and maximum bounds.
 * Used to ensure health/stamina values stay within valid ranges.
 * 
 * @param {number} n - Value to clamp
 * @param {number} lo - Minimum allowed value
 * @param {number} hi - Maximum allowed value
 * @returns {number} Clamped value between lo and hi
 */
function clamp(n, lo, hi) { 
  return Math.max(lo, Math.min(hi, n)); 
}

/**
 * DATABASE COLUMN EXISTENCE VALIDATION
 * 
 * Ensures all required columns exist in the players table for regeneration system.
 * Adds missing columns dynamically to handle database schema evolution.
 * This function is idempotent - safe to run multiple times.
 */
function ensureColumns() {
  try {
    // Get list of all existing columns in players table
    const cols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
    
    // Add health update timestamp column if missing
    if (!cols.includes('healthUpdatedAt')) {
      db.prepare("ALTER TABLE players ADD COLUMN healthUpdatedAt INTEGER").run();
      // Initialize existing players with current timestamp
      db.prepare("UPDATE players SET healthUpdatedAt = strftime('%s','now')*1000 WHERE healthUpdatedAt IS NULL").run();
    }
    // Add stamina update timestamp column if missing
    if (!cols.includes('staminaUpdatedAt')) {
      db.prepare("ALTER TABLE players ADD COLUMN staminaUpdatedAt INTEGER").run();
      // Initialize existing players with current timestamp
      db.prepare("UPDATE players SET staminaUpdatedAt = strftime('%s','now')*1000 WHERE staminaUpdatedAt IS NULL").run();
    }
    
    // Add premium status column if missing (for regeneration bonuses)
    if (!cols.includes('isPremium')) {
      db.prepare("ALTER TABLE players ADD COLUMN isPremium INTEGER DEFAULT 0").run();
      db.prepare("UPDATE players SET isPremium = COALESCE(isPremium, 0)").run();
    }
    
    // Add last combat timestamp column if missing (for combat penalties)
    if (!cols.includes('lastCombatAt')) {
      db.prepare("ALTER TABLE players ADD COLUMN lastCombatAt INTEGER DEFAULT 0").run();
    }
    
    // Add regeneration effects column if missing (for item buffs)
    if (!cols.includes('regenEffects')) {
      db.prepare("ALTER TABLE players ADD COLUMN regenEffects TEXT DEFAULT '{}'").run();
    }
    
    // Add current biome column if missing (for location bonuses)
    if (!cols.includes('currentBiome')) {
      db.prepare("ALTER TABLE players ADD COLUMN currentBiome TEXT DEFAULT 'city'").run();
    }
  } catch (e) {
    // Ignore errors - tables might not exist on first boot
    // Database initialization will handle table creation
  }
}

// Run column validation on module load
ensureColumns();

/**
 * LOCATION-BASED REGENERATION MULTIPLIERS
 * 
 * Calculates regeneration rate multipliers based on player's current biome/location.
 * Different environments provide different healing rates (e.g., hospitals heal faster).
 * 
 * @param {string} biome - Current biome/location type
 * @returns {Object} Object with health and stamina multiplier values
 */
function getLocationMultiplier(biome) {
  // Get location bonuses from config, with fallback to empty object
  const locationBonuses = regenConfig.locationBonuses || {};
  // Get bonuses for specific biome, fallback to city, then to empty object
  const bonus = locationBonuses[biome] || locationBonuses['city'] || {};
  
  return {
    health: bonus.healthMultiplier || 1.0,   // Health regeneration multiplier
    stamina: bonus.staminaMultiplier || 1.0  // Stamina regeneration multiplier
  };
}

/**
 * ACTIVITY-BASED REGENERATION PENALTIES
 * 
 * Calculates regeneration penalties based on recent player activities.
 * Recent travel or combat reduces regeneration rates temporarily.
 * This adds realism - you heal slower when recently active or stressed.
 * 
 * @param {string} userId - Player to check activity penalties for
 * @param {number} now - Current timestamp for recency calculations
 * @returns {Object} Object with health and stamina penalty multipliers
 */
function getActivityPenalty(userId, now) {
  // Get player's recent activity timestamps
  const player = db.prepare(`SELECT travelArrivalAt, lastCombatAt FROM players WHERE userId=?`).get(userId);
  if (!player) return { health: 1.0, stamina: 1.0 };

  // Start with no penalties (1.0 = normal rate)
  let healthMult = 1.0;
  let staminaMult = 1.0;

  // Get penalty configuration settings
  const penalties = regenConfig.activityPenalties || {};
  
  // Apply travel penalty if player recently completed travel
  if (player.travelArrivalAt && (now - player.travelArrivalAt) < (penalties.recently_traveled?.duration || 300000)) {
    const travelPenalty = penalties.recently_traveled || {};
    // Travel is exhausting - reduces regeneration rates temporarily
    healthMult *= (travelPenalty.healthMultiplier || 0.7);   // 70% health regen
    staminaMult *= (travelPenalty.staminaMultiplier || 0.3); // 30% stamina regen
  }

  // Apply combat penalty if player was recently in combat
  if (player.lastCombatAt && (now - player.lastCombatAt) < (penalties.in_combat?.duration || 600000)) {
    const combatPenalty = penalties.in_combat || {};
    // Combat stress severely impacts regeneration
    healthMult *= (combatPenalty.healthMultiplier || 0.2);   // 20% health regen
    staminaMult *= (combatPenalty.staminaMultiplier || 0.1); // 10% stamina regen
  }

  return { health: healthMult, stamina: staminaMult };
}

function getActiveItemEffects(userId, now) {
  const player = db.prepare(`SELECT regenEffects FROM players WHERE userId=?`).get(userId);
  if (!player || !player.regenEffects) return { health: 1.0, stamina: 1.0 };

  let effects;
  try {
    effects = JSON.parse(player.regenEffects);
  } catch {
    return { health: 1.0, stamina: 1.0 };
  }

  let healthMult = 1.0;
  let staminaMult = 1.0;
  const itemBonuses = regenConfig.itemBonuses || {};
  let effectsChanged = false;

  for (const [effectName, effectData] of Object.entries(effects)) {
    if (effectData.expiresAt > now) {
      const bonus = itemBonuses[effectName];
      if (bonus) {
        healthMult *= (bonus.healthMultiplier || 1.0);
        staminaMult *= (bonus.staminaMultiplier || 1.0);
      }
    } else {
      delete effects[effectName];
      effectsChanged = true;
    }
  }

  if (effectsChanged) {
    db.prepare(`UPDATE players SET regenEffects=? WHERE userId=?`)
      .run(JSON.stringify(effects), userId);
  }

  return { health: healthMult, stamina: staminaMult };
}

/**
 * PREMIUM USER REGENERATION BONUSES
 * 
 * Calculates bonus multipliers and maximum increases for premium users.
 * Premium users get faster regeneration and higher maximum values as a benefit.
 * 
 * @param {boolean} isPremium - Whether user has premium status
 * @returns {Object} Bonus multipliers and maximum value increases
 */
function getPremiumBonuses(isPremium) {
  // Non-premium users get no bonuses
  if (!isPremium) return { health: 1.0, stamina: 1.0, maxHealthBonus: 0, maxStaminaBonus: 0 };
  
  // Get premium bonus configuration
  const premiumBonuses = regenConfig.premiumBonuses || {};
  
  return {
    health: premiumBonuses.healthMultiplier || 1.5,      // 150% health regen rate
    stamina: premiumBonuses.staminaMultiplier || 1.3,    // 130% stamina regen rate  
    maxHealthBonus: premiumBonuses.maxHealthBonus || 50, // +50 max health
    maxStaminaBonus: premiumBonuses.maxStaminaBonus || 30 // +30 max stamina
  };
}

function applyItemEffect(userId, itemId, duration = null) {
  const itemBonuses = regenConfig.itemBonuses || {};
  const bonus = itemBonuses[itemId];
  if (!bonus) return false;

  const effectDuration = duration || bonus.duration || 900000; // Default 15 minutes
  const expiresAt = Date.now() + effectDuration;

  const player = db.prepare(`SELECT regenEffects FROM players WHERE userId=?`).get(userId);
  let effects = {};
  
  if (player && player.regenEffects) {
    try {
      effects = JSON.parse(player.regenEffects);
    } catch {}
  }

  effects[itemId] = { expiresAt };
  
  db.prepare(`UPDATE players SET regenEffects=? WHERE userId=?`)
    .run(JSON.stringify(effects), userId);
  
  return true;
}

function updateCombatStatus(userId) {
  const now = Date.now();
  db.prepare(`UPDATE players SET lastCombatAt=? WHERE userId=?`).run(now, userId);
}

function updateBiome(userId, biome) {
  db.prepare(`UPDATE players SET currentBiome=? WHERE userId=?`).run(biome, userId);
}

function applyRegenForUser(userId) {
  try {
    const now = Date.now();
    const row = db.prepare(`
      SELECT health, stamina, healthUpdatedAt, staminaUpdatedAt, 
             isPremium, currentBiome, travelArrivalAt, lastCombatAt, regenEffects 
      FROM players WHERE userId=?
    `).get(userId);
    
    if (!row) return;
    
    let { health, stamina, healthUpdatedAt, staminaUpdatedAt, isPremium, currentBiome } = row;

    // Calculate maximum values with premium bonuses
    const premiumBonuses = getPremiumBonuses(isPremium);
    const maxH = MAX_H + premiumBonuses.maxHealthBonus;
    const maxS = MAX_S + premiumBonuses.maxStaminaBonus;

    // Calculate elapsed time in minutes
    const hElapsedMin = Math.max(0, Math.floor((now - (healthUpdatedAt || 0)) / 60000));
    const sElapsedMin = Math.max(0, Math.floor((now - (staminaUpdatedAt || 0)) / 60000));

    if (hElapsedMin > 0 || sElapsedMin > 0) {
      // Get all multipliers
      const locationMult = getLocationMultiplier(currentBiome || 'city');
      const activityPenalty = getActivityPenalty(userId, now);
      const itemEffects = getActiveItemEffects(userId, now);

      // Calculate health regeneration
      if (hElapsedMin > 0 && health < maxH) {
        const totalHealthMult = locationMult.health * 
                               activityPenalty.health * 
                               itemEffects.health * 
                               premiumBonuses.health;
        
        const healthRegen = hElapsedMin * BASE_HPM * totalHealthMult;
        health = clamp(health + healthRegen, 0, maxH);
        healthUpdatedAt = now;
      }

      // Calculate stamina regeneration  
      if (sElapsedMin > 0 && stamina < maxS) {
        const totalStaminaMult = locationMult.stamina * 
                                activityPenalty.stamina * 
                                itemEffects.stamina * 
                                premiumBonuses.stamina;
        
        const staminaRegen = sElapsedMin * BASE_SPM * totalStaminaMult;
        stamina = clamp(stamina + staminaRegen, 0, maxS);
        staminaUpdatedAt = now;
      }

      // Update database
      if (health !== row.health || stamina !== row.stamina) {
        db.prepare(`
          UPDATE players SET health=?, stamina=?, healthUpdatedAt=?, staminaUpdatedAt=? 
          WHERE userId=?
        `).run(health, stamina, healthUpdatedAt, staminaUpdatedAt, userId);
      }
    }
  } catch (e) {
    console.error('Regen error for user:', userId, e);
  }
}

function applyRegenToAll() {
  try {
    const now = Date.now();

    // Process travel completions in a transaction to prevent race conditions
    const completeTravels = db.transaction(() => {
      // First, get and lock the completed travels
      const completedTravels = db.prepare(`
        SELECT userId, travelFromGuildId, locationGuildId, travelStartAt, travelArrivalAt
        FROM players
        WHERE travelArrivalAt > 0 AND travelArrivalAt <= ?
      `).all(now);

      if (completedTravels.length === 0) return;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚶 TRAVEL COMPLETIONS: ${completedTravels.length} player(s) arrived`);
      console.log('⏰ Time: %s', new Date().toISOString());

      // Record travel history for completed travels
      for (const travel of completedTravels) {
        const travelTime = travel.travelArrivalAt - travel.travelStartAt;
        const travelMinutes = Math.round(travelTime / 60000);
        recordTravel(travel.userId, travel.travelFromGuildId, travel.locationGuildId, travelTime);

        // Log individual travel completion
        const destination = travel.locationGuildId.startsWith('landmark_')
          ? `Landmark: ${travel.locationGuildId}`
          : `Server: ${travel.locationGuildId}`;
        console.log(`   👤 User ${travel.userId} → ${destination} (${travelMinutes} min)`);

        // Handle landmark arrivals
        if (travel.locationGuildId && travel.locationGuildId.startsWith('landmark_')) {
          const landmarkId = travel.locationGuildId.replace('landmark_', '');

          try {
            // Get POI info
            const poi = db.prepare('SELECT * FROM pois WHERE id = ?').get(landmarkId);
            if (poi) {
              // Check if already visited
              const alreadyVisited = db.prepare('SELECT 1 FROM poi_visits WHERE userId = ? AND poiId = ?').get(travel.userId, landmarkId);

              if (!alreadyVisited) {
                // Record first visit
                db.prepare('INSERT INTO poi_visits (userId, poiId, visitedAt, isFirstVisit) VALUES (?, ?, ?, 1)').run(
                  travel.userId, landmarkId, now
                );
                console.log(`      🎉 First visit to ${poi.name}!`);
              }
            }
          } catch (error) {
            console.error('Error processing landmark arrival:', error);
          }
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Clear completed travels atomically
      db.prepare(`
        UPDATE players
        SET travelArrivalAt = 0
        WHERE travelArrivalAt > 0 AND travelArrivalAt <= ?
      `).run(now);
    });

    // Execute the travel completion transaction
    completeTravels();
    
    const rows = db.prepare(`
      SELECT userId, health, stamina, healthUpdatedAt, staminaUpdatedAt, 
             isPremium, currentBiome, travelArrivalAt, lastCombatAt, regenEffects 
      FROM players
    `).all();
    
    const upd = db.prepare(`
      UPDATE players SET health=?, stamina=?, healthUpdatedAt=?, staminaUpdatedAt=?, regenEffects=? 
      WHERE userId=?
    `);
    
    const tx = db.transaction((list) => {
      for (const r of list) {
        const premiumBonuses = getPremiumBonuses(r.isPremium);
        const maxH = MAX_H + premiumBonuses.maxHealthBonus;
        const maxS = MAX_S + premiumBonuses.maxStaminaBonus;

        let h = r.health, s = r.stamina;
        let hu = r.healthUpdatedAt || 0;
        let su = r.staminaUpdatedAt || 0;
        let regenEffects = r.regenEffects;

        const hMin = Math.max(0, Math.floor((now - hu) / 60000));
        const sMin = Math.max(0, Math.floor((now - su) / 60000));

        if (hMin > 0 || sMin > 0) {
          // Get all multipliers (simplified for batch processing)
          const locationMult = getLocationMultiplier(r.currentBiome || 'city');
          
          // Simplified activity penalty calculation
          let activityHealthMult = 1.0;
          let activityStaminaMult = 1.0;
          
          if (r.travelArrivalAt && (now - r.travelArrivalAt) < 300000) {
            activityHealthMult *= 0.7;
            activityStaminaMult *= 0.3;
          }
          
          if (r.lastCombatAt && (now - r.lastCombatAt) < 600000) {
            activityHealthMult *= 0.2;
            activityStaminaMult *= 0.1;
          }

          // Process item effects
          let itemHealthMult = 1.0;
          let itemStaminaMult = 1.0;
          let effects = {};
          
          if (regenEffects) {
            try {
              effects = JSON.parse(regenEffects);
              const itemBonuses = regenConfig.itemBonuses || {};
              
              for (const [effectName, effectData] of Object.entries(effects)) {
                if (effectData.expiresAt > now) {
                  const bonus = itemBonuses[effectName];
                  if (bonus) {
                    itemHealthMult *= (bonus.healthMultiplier || 1.0);
                    itemStaminaMult *= (bonus.staminaMultiplier || 1.0);
                  }
                } else {
                  delete effects[effectName];
                }
              }
              
              regenEffects = JSON.stringify(effects);
            } catch {
              regenEffects = '{}';
            }
          } else {
            regenEffects = '{}';
          }

          // Apply regeneration
          if (hMin > 0 && h < maxH) {
            const totalHealthMult = locationMult.health * 
                                   activityHealthMult * 
                                   itemHealthMult * 
                                   premiumBonuses.health;
            h = clamp(h + hMin * BASE_HPM * totalHealthMult, 0, maxH);
            hu = now;
          }

          if (sMin > 0 && s < maxS) {
            const totalStaminaMult = locationMult.stamina * 
                                    activityStaminaMult * 
                                    itemStaminaMult * 
                                    premiumBonuses.stamina;
            s = clamp(s + sMin * BASE_SPM * totalStaminaMult, 0, maxS);
            su = now;
          }
        }

        if (h !== r.health || s !== r.stamina || regenEffects !== r.regenEffects) {
          upd.run(h, s, hu, su, regenEffects, r.userId);
        }
      }
    });
    
    tx(rows);
  } catch (e) {
    console.error('Batch regen error:', e);
  }
}

function getRegenStatus(userId) {
  const row = db.prepare(`
    SELECT health, stamina, isPremium, currentBiome, 
           travelArrivalAt, lastCombatAt, regenEffects 
    FROM players WHERE userId=?
  `).get(userId);
  
  if (!row) return null;

  const now = Date.now();
  const premiumBonuses = getPremiumBonuses(row.isPremium);
  const maxH = MAX_H + premiumBonuses.maxHealthBonus;
  const maxS = MAX_S + premiumBonuses.maxStaminaBonus;
  
  const locationMult = getLocationMultiplier(row.currentBiome || 'city');
  const activityPenalty = getActivityPenalty(userId, now);
  const itemEffects = getActiveItemEffects(userId, now);

  const effectiveHealthRegen = BASE_HPM * 
                              locationMult.health * 
                              activityPenalty.health * 
                              itemEffects.health * 
                              premiumBonuses.health;
  
  const effectiveStaminaRegen = BASE_SPM * 
                               locationMult.stamina * 
                               activityPenalty.stamina * 
                               itemEffects.stamina * 
                               premiumBonuses.stamina;

  return {
    health: row.health,
    maxHealth: maxH,
    stamina: row.stamina,
    maxStamina: maxS,
    healthRegenPerMinute: effectiveHealthRegen,
    staminaRegenPerMinute: effectiveStaminaRegen,
    currentBiome: row.currentBiome,
    isPremium: row.isPremium,
    activeEffects: row.regenEffects ? JSON.parse(row.regenEffects) : {}
  };
}

/**
 * MODULE EXPORTS - REGENERATION SYSTEM API
 * 
 * Export all regeneration-related functions for use by other modules.
 * This API provides both individual player operations and batch processing.
 */
module.exports = { 
  applyRegenForUser,      // Apply regeneration to single player
  applyRegenToAll,        // Batch regeneration for all players + travel completion
  applyItemEffect,        // Apply temporary item-based regeneration effects
  updateCombatStatus,     // Mark player as recently in combat (affects regen)
  updateBiome,            // Update player's current biome for location bonuses
  getRegenStatus,         // Get current regeneration rates and status for player
  MAX_H,                  // Base maximum health constant
  MAX_S                   // Base maximum stamina constant
};