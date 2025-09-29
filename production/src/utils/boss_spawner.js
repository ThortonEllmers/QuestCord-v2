const { db } = require('./store_sqlite');
const config = require('./config');

/**
 * Automatic Boss Spawning System
 * Maintains exactly 1 boss active at all times globally
 * Spawns new boss when current boss is defeated or expires
 */

// Boss spawn configuration
const BOSS_CONFIG = {
  SPAWN_INTERVAL: 2 * 60 * 60 * 1000, // 2 hours in milliseconds (check more frequently for single boss)
  MAX_GLOBAL_BOSSES: 1, // Only 1 boss at a time globally
  MAX_BOSSES_PER_CYCLE: 1, // Maximum bosses that can spawn in a single cycle
  SPAWN_CHANCE: 1.0, // 100% chance to spawn when no boss is active
  NOTIFICATION_CHANNEL_ID: '1411045103921004554',
  BOSS_ROLE_ID: '1411051374153826386' // Correct boss notification role
};

// Boss tier distribution (weighted random selection)
const BOSS_TIER_WEIGHTS = {
  1: 40, // 40% chance
  2: 30, // 30% chance  
  3: 20, // 20% chance
  4: 8,  // 8% chance
  5: 2   // 2% chance (legendary)
};

// Biome-specific boss names
const BOSS_NAMES = {
  volcanic: ['Inferno Drake', 'Magma Colossus', 'Pyroclast Titan', 'Ember Lord', 'Volcanic Warden'],
  ice: ['Frost Giant', 'Glacial Behemoth', 'Blizzard King', 'Ice Wraith', 'Arctic Sovereign'],
  forest: ['Ancient Treant', 'Forest Guardian', 'Thorn Monarch', 'Verdant Colossus', 'Woodland Protector'],
  desert: ['Sand Worm', 'Dune Stalker', 'Desert Pharaoh', 'Mirage Demon', 'Sandstone Golem'],
  swamp: ['Bog Monster', 'Marsh Tyrant', 'Pestilent Drake', 'Swamp Leviathan', 'Mire Lord'],
  mountain: ['Stone Giant', 'Peak Guardian', 'Crag Demon', 'Mountain King', 'Boulder Behemoth'],
  ruins: ['Ancient Sentinel', 'Ruin Wraith', 'Forgotten Titan', 'Temple Guardian', 'Lost Colossus'],
  meadow: ['Storm Eagle', 'Wind Dancer', 'Prairie Lord', 'Grassland Titan', 'Nature\'s Fury'],
  water: ['Kraken Spawn', 'Tidal Behemoth', 'Deep Sea Terror', 'Ocean Lord', 'Abyssal Guardian']
};

/**
 * Initialize boss spawning system
 */
function initializeBossSpawner() {
  try {
    console.log('[boss_spawner] Automatic boss spawning system initialized');
    console.log(`[boss_spawner] Config: ${BOSS_CONFIG.MAX_GLOBAL_BOSSES} max bosses globally, ${BOSS_CONFIG.MAX_BOSSES_PER_CYCLE} max per cycle, ${(BOSS_CONFIG.SPAWN_CHANCE * 100)}% spawn chance`);
    console.log(`[boss_spawner] Timing: spawn cycles every 4-6 hours (base ${BOSS_CONFIG.SPAWN_INTERVAL / 1000 / 60 / 60} hours)`);
    return true;
  } catch (error) {
    console.error('[boss_spawner] Failed to initialize boss spawner:', error.message);
    return false;
  }
}

/**
 * Clean up expired bosses and orphaned boss fighter roles
 */
async function cleanupExpiredBosses(client = null) {
  try {
    const now = Date.now();
    
    // Find expired bosses
    const expiredBosses = db.prepare('SELECT * FROM bosses WHERE active = 1 AND expiresAt < ?').all(now);
    
    if (expiredBosses.length > 0) {
      // Mark expired bosses as inactive
      db.prepare('UPDATE bosses SET active = 0 WHERE active = 1 AND expiresAt < ?').run(now);
      
      // Clean up boss participants for expired bosses and remove roles
      for (const boss of expiredBosses) {
        try {
          // Get participants before deleting records
          const participants = db.prepare('SELECT userId FROM boss_participants WHERE bossId = ?').all(boss.id);
          
          console.log(`[boss_spawner] Cleaning up boss ${boss.id} (${boss.name}) in guild ${boss.guildId} - ${participants.length} participants`);
          
          // Remove boss fighter roles from expired boss participants
          if (client && participants.length > 0) {
            try {
              await cleanupBossFighterRoles(client, boss.guildId, participants.map(p => p.userId));
              console.log(`[boss_spawner] Successfully cleaned up roles for boss ${boss.id}`);
            } catch (error) {
              console.warn(`[boss_spawner] Failed to cleanup roles for boss ${boss.id}:`, error.message);
              // Continue with database cleanup even if role cleanup fails
            }
          }
          
          // Clean up database records
          const deleteResult = db.prepare('DELETE FROM boss_participants WHERE bossId = ?').run(boss.id);
          console.log(`[boss_spawner] Deleted ${deleteResult.changes} participation records for boss ${boss.id}`);
          
        } catch (error) {
          console.error(`[boss_spawner] Error cleaning up boss ${boss.id}:`, error.message);
          // Try to at least clean up the database records
          try {
            db.prepare('DELETE FROM boss_participants WHERE bossId = ?').run(boss.id);
            console.log(`[boss_spawner] Fallback: Cleaned up database records for boss ${boss.id}`);
          } catch (dbError) {
            console.error(`[boss_spawner] Failed to clean up database records for boss ${boss.id}:`, dbError.message);
          }
        }
      }
      
      console.log(`[boss_spawner] Cleaned up ${expiredBosses.length} expired bosses`);
    }
    
    // Additional database integrity check - clean up any orphaned participation records
    // that might have been missed due to errors
    try {
      const orphanedRecords = db.prepare(`
        SELECT COUNT(*) as count 
        FROM boss_participants bp 
        LEFT JOIN bosses b ON bp.bossId = b.id 
        WHERE b.active = 0 OR b.expiresAt < ? OR b.id IS NULL
      `).get(now);
      
      if (orphanedRecords.count > 0) {
        const cleanupResult = db.prepare(`
          DELETE FROM boss_participants 
          WHERE bossId IN (
            SELECT bp.bossId FROM boss_participants bp 
            LEFT JOIN bosses b ON bp.bossId = b.id 
            WHERE b.active = 0 OR b.expiresAt < ? OR b.id IS NULL
          )
        `).run(now);
        
        if (cleanupResult.changes > 0) {
          console.log(`[boss_spawner] Database integrity check: Cleaned up ${cleanupResult.changes} orphaned participation records`);
        }
      }
    } catch (error) {
      console.warn('[boss_spawner] Database integrity check failed:', error.message);
    }

    // Periodic cleanup of orphaned boss fighter roles (every 10 minutes for better UX)
    if (client && (!cleanupExpiredBosses._lastRoleCleanup || (now - cleanupExpiredBosses._lastRoleCleanup) > 10 * 60 * 1000)) {
      try {
        await cleanupOrphanedBossFighterRoles(client);
        cleanupExpiredBosses._lastRoleCleanup = now;
      } catch (error) {
        console.warn('[boss_spawner] Periodic role cleanup failed:', error.message);
      }
    }
    
    return expiredBosses.length;
  } catch (error) {
    console.error('[boss_spawner] Error cleaning up expired bosses:', error.message);
    return 0;
  }
}

/**
 * Get random weighted boss tier
 */
function getRandomBossTier() {
  const totalWeight = Object.values(BOSS_TIER_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const [tier, weight] of Object.entries(BOSS_TIER_WEIGHTS)) {
    random -= weight;
    if (random <= 0) {
      return parseInt(tier);
    }
  }
  
  return 1; // Fallback
}

/**
 * Get random boss name for biome
 */
function getBossNameForBiome(biome) {
  const normalizedBiome = biome ? biome.toLowerCase() : 'ruins';
  const names = BOSS_NAMES[normalizedBiome] || BOSS_NAMES.ruins;
  return names[Math.floor(Math.random() * names.length)];
}

/**
 * Find eligible servers for boss spawning
 */
function getEligibleServersForBoss() {
  try {
    // Get servers that are eligible for boss spawns
    // - Not archived
    // - Have coordinates
    // - Not the spawn server
    // - No active boss currently
    // - Not on cooldown

    const spawnGuildId = process.env.SPAWN_GUILD_ID;
    const now = Date.now();
    const cooldownMs = (config.boss?.cooldownSeconds || 3600) * 1000; // Default 1 hour cooldown

    const servers = db.prepare(`
      SELECT s.*, b.id as activeBossId
      FROM servers s
      LEFT JOIN bosses b ON s.guildId = b.guildId AND b.active = 1
      WHERE s.archived = 0
        AND s.lat IS NOT NULL
        AND s.lon IS NOT NULL
        AND s.guildId != ?
        AND b.id IS NULL
        AND (s.lastBossAt IS NULL OR s.lastBossAt < ?)
    `).all(spawnGuildId || '', now - cooldownMs);

    // All servers (except spawn server) are now eligible for boss spawns
    return servers;
  } catch (error) {
    console.error('[boss_spawner] Error getting eligible servers:', error.message);
    return [];
  }
}

/**
 * Spawn a boss on a random eligible server
 */
function spawnRandomBoss(client = null) {
  try {
    const eligibleServers = getEligibleServersForBoss();
    
    if (eligibleServers.length === 0) {
      console.log('[boss_spawner] No eligible servers found for boss spawn');
      return null;
    }
    
    // Select random server
    const server = eligibleServers[Math.floor(Math.random() * eligibleServers.length)];
    
    // Generate boss parameters
    const tier = getRandomBossTier();
    const name = getBossNameForBiome(server.biome);
    const baseHp = config.boss?.baseHp || 2000;
    const hp = Math.floor(baseHp * (1 + (tier - 1) * 0.4)); // More HP scaling for higher tiers
    const duration = (config.boss?.ttlSeconds || 3600) * 1000; // Default 1 hour
    const now = Date.now();
    const expiresAt = now + duration;
    
    // Create boss in database
    const result = db.prepare(`
      INSERT INTO bosses (guildId, name, maxHp, hp, startedAt, expiresAt, active, tier)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(server.guildId, name, hp, hp, now, expiresAt, tier);
    
    // Update server's last boss time
    db.prepare('UPDATE servers SET lastBossAt = ? WHERE guildId = ?').run(now, server.guildId);
    
    const bossData = {
      id: result.lastInsertRowid,
      guildId: server.guildId,
      name,
      maxHp: hp,
      hp,
      tier,
      serverName: server.name,
      biome: server.biome,
      startedAt: now,
      expiresAt
    };
    
    console.log(`[boss_spawner] Spawned Tier ${tier} ${name} (${hp} HP) in ${server.name} (${server.guildId})`);
    
    // Send Discord notification
    if (client) {
      notifyBossSpawn(bossData, client);
    }
    
    return bossData;
    
  } catch (error) {
    console.error('[boss_spawner] Error spawning random boss:', error.message);
    return null;
  }
}

/**
 * Send Discord notification for new boss spawn
 */
async function notifyBossSpawn(bossData, client) {
  try {
    const channel = await client.channels.fetch(BOSS_CONFIG.NOTIFICATION_CHANNEL_ID);
    if (!channel) {
      console.warn('[boss_spawner] Could not find boss notification channel');
      return;
    }

    // Calculate time remaining
    const timeRemainingMs = bossData.expiresAt - Date.now();
    const timeRemainingHours = Math.round(timeRemainingMs / 1000 / 60 / 60 * 10) / 10;

    // Tier-based color and description
    const tierColors = {
      1: 0x808080, // Gray
      2: 0x00FF00, // Green  
      3: 0x0080FF, // Blue
      4: 0x8000FF, // Purple
      5: 0xFFD700  // Gold
    };
    
    const tierNames = {
      1: 'Common',
      2: 'Uncommon', 
      3: 'Rare',
      4: 'Epic',
      5: 'Legendary'
    };

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${bossData.name} has spawned!`)
      .setDescription(`A **Tier ${bossData.tier} ${tierNames[bossData.tier]}** boss has emerged and threatens the realm!`)
      .setColor(tierColors[bossData.tier] || 0xFF0000)
      .addFields(
        {
          name: '💀 Boss Info',
          value: `**HP:** ${bossData.maxHp.toLocaleString()}\n**Type:** ${tierNames[bossData.tier]} (Tier ${bossData.tier})\n**Biome:** ${bossData.biome || 'Unknown'}`,
          inline: true
        },
        {
          name: '📍 Location',
          value: `**${bossData.serverName || 'Unknown Server'}**\n\n🌐 [Visit Website](https://questcord.fun/)`,
          inline: true
        },
        {
          name: '⏰ Time Left',
          value: `**${timeRemainingHours}h**\n\nHurry before it escapes!`,
          inline: true
        }
      )
      .addFields({
        name: '⚔️ How to Fight',
        value: '• Join the server where the boss spawned\n• Use `/boss attack` to deal damage\n• Work together with other players!\n• Defeat it for valuable rewards',
        inline: false
      })
      .setFooter({
        text: 'Boss spawned on server • QuestCord',
        iconURL: client.user?.displayAvatarURL()
      })
      .setTimestamp();

    // Send notification with boss role ping
    await channel.send({
      content: `<@&${BOSS_CONFIG.BOSS_ROLE_ID}> 🔥 NEW BOSS ALERT 🔥`,
      embeds: [embed]
    });

    console.log(`[boss_spawner] Sent Discord notification for ${bossData.name}`);

  } catch (error) {
    console.error('[boss_spawner] Failed to send boss notification:', error.message);
  }
}

/**
 * Get next spawn interval with randomization (1 hour)
 */
function getNextSpawnInterval() {
  const hours = 1;
  return hours * 60 * 60 * 1000; // Convert to milliseconds (1 hour)
}

/**
 * Automatic boss spawning cycle - Smart spawning based on server count
 */
async function runBossSpawningCycle(client = null) {
  try {
    // Clean up expired bosses first (includes role cleanup if client is provided)
    const expiredCount = await cleanupExpiredBosses(client);
    
    // Run orphaned role cleanup every 2 cycles (every 8-12 hours since cycles run every 4-6 hours)
    if (typeof runBossSpawningCycle.cycleCount === 'undefined') {
      runBossSpawningCycle.cycleCount = 0;
    }
    runBossSpawningCycle.cycleCount++;
    
    if (client && runBossSpawningCycle.cycleCount % 2 === 0) {
      console.log('[boss_spawner] Running periodic orphaned boss fighter role cleanup...');
      cleanupOrphanedBossFighterRoles(client);
    }
    
    // Get current active boss count
    const activeBosses = db.prepare('SELECT COUNT(*) as count FROM bosses WHERE active = 1').get();
    const currentCount = activeBosses?.count || 0;
    
    console.log(`[boss_spawner] Current active bosses: ${currentCount}/1 (single boss system, cleaned up ${expiredCount} expired)`);
    
    // Don't spawn if we already have an active boss
    if (currentCount >= 1) {
      console.log('[boss_spawner] Boss already active, skipping spawn cycle');
      return;
    }
    
    // Always spawn when no boss is active (simplified logic)
    const adaptiveSpawnChance = BOSS_CONFIG.SPAWN_CHANCE;
    
    // Check for global boss defeat cooldown (5 minutes after any boss is defeated)
    let lastBossDefeat = 0;
    try {
      // Create system_settings table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `);
      
      const setting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('lastBossDefeat');
      lastBossDefeat = setting ? parseInt(setting.value) : 0;
    } catch (error) {
      console.warn('[boss_spawner] Error checking last boss defeat time:', error.message);
      lastBossDefeat = 0;
    }
    
    const defeatCooldown = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (lastBossDefeat && (Date.now() - lastBossDefeat) < defeatCooldown) {
      const timeLeft = Math.round((defeatCooldown - (Date.now() - lastBossDefeat)) / 1000 / 60);
      console.log(`[boss_spawner] Global boss defeat cooldown active, ${timeLeft} minutes remaining`);
      return;
    }
    
    // Calculate how many bosses to potentially spawn based on current count and global limit
    const bossesToSpawn = Math.min(BOSS_CONFIG.MAX_GLOBAL_BOSSES - currentCount, BOSS_CONFIG.MAX_BOSSES_PER_CYCLE);
    
    if (bossesToSpawn <= 0) {
      console.log('[boss_spawner] Dynamic boss limit reached, no bosses to spawn');
      return;
    }
    
    // Spawn bosses with adaptive chance-based system
    let spawnedCount = 0;
    console.log(`[boss_spawner] Attempting to spawn up to ${bossesToSpawn} boss(es) with ${(adaptiveSpawnChance * 100).toFixed(1)}% chance each`);
    
    for (let i = 0; i < bossesToSpawn; i++) {
      if (Math.random() < adaptiveSpawnChance) {
        const boss = spawnRandomBoss(client);
        
        if (boss) {
          spawnedCount++;
          console.log(`[boss_spawner] Spawned boss ${spawnedCount}: ${boss.name} in ${boss.serverName || boss.guildId}`);
        }
      }
    }
    
    if (spawnedCount > 0) {
      console.log(`[boss_spawner] Spawned ${spawnedCount} new boss(es) this cycle (${spawnedCount}/${bossesToSpawn} potential slots filled)`);
    } else {
      console.log('[boss_spawner] No bosses spawned this cycle due to chance/availability');
    }
    
  } catch (error) {
    console.error('[boss_spawner] Error in boss spawning cycle:', error.message);
  }
}

/**
 * Record when a boss is defeated (triggers 10-minute cooldown)
 */
function recordBossDefeat() {
  try {
    // Create system_settings table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);
    
    const now = Date.now();
    
    // Use REPLACE to insert or update the lastBossDefeat timestamp
    db.prepare(`
      REPLACE INTO system_settings (key, value, updatedAt) 
      VALUES (?, ?, ?)
    `).run('lastBossDefeat', now.toString(), now);
    
    console.log(`[boss_spawner] Recorded boss defeat at ${new Date(now).toLocaleTimeString()}, 10-minute spawn cooldown activated`);
    
    return true;
  } catch (error) {
    console.error('[boss_spawner] Error recording boss defeat:', error.message);
    return false;
  }
}

/**
 * Remove boss fighter roles from specific users in a guild
 */
async function cleanupBossFighterRoles(client, guildId, userIds) {
  if (!client || !userIds || userIds.length === 0) return;
  
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;
    
    const BOSS_FIGHTER_ROLE_ID = '1411043105830076497';
    const role = guild.roles.cache.get(BOSS_FIGHTER_ROLE_ID);
    if (!role) return;
    
    let removedCount = 0;
    for (const userId of userIds) {
      try {
        const member = await guild.members.fetch(userId);
        if (member && member.roles.cache.has(BOSS_FIGHTER_ROLE_ID)) {
          // Check if user still has active boss participations in ANY guild
          const activeParticipations = db.prepare(`
            SELECT COUNT(*) as count 
            FROM boss_participants bp 
            JOIN bosses b ON bp.bossId = b.id 
            WHERE bp.userId = ? AND b.active = 1 AND b.expiresAt > ?
          `).get(userId, Date.now());
          
          // Only remove role if user has no active boss fights remaining
          if (activeParticipations.count === 0) {
            await member.roles.remove(role);
            removedCount++;
            console.log(`[boss_spawner] Removed boss fighter role from user ${userId} in guild ${guildId} (no active fights)`);
          } else {
            console.log(`[boss_spawner] Kept boss fighter role for user ${userId} in guild ${guildId} (${activeParticipations.count} active fights)`);
          }
        }
      } catch (error) {
        console.warn(`[boss_spawner] Failed to remove role from user ${userId}:`, error.message);
      }
    }
    
    if (removedCount > 0) {
      console.log(`[boss_spawner] Removed boss fighter roles from ${removedCount} users in guild ${guildId}`);
    }
  } catch (error) {
    console.error('[boss_spawner] Error cleaning up boss fighter roles:', error.message);
  }
}

/**
 * Clean up orphaned boss fighter roles (users who have the role but aren't in any active boss fights)
 */
async function cleanupOrphanedBossFighterRoles(client) {
  try {
    const BOSS_FIGHTER_ROLE_ID = '1411043105830076497';
    
    // Get all active boss participants
    const activeBossParticipants = db.prepare(`
      SELECT DISTINCT bp.userId, b.guildId 
      FROM boss_participants bp 
      JOIN bosses b ON bp.bossId = b.id 
      WHERE b.active = 1 AND b.expiresAt > ?
    `).all(Date.now());
    
    // Create a Set for fast lookup of active participants
    const activeParticipantMap = new Map();
    activeBossParticipants.forEach(p => {
      if (!activeParticipantMap.has(p.guildId)) {
        activeParticipantMap.set(p.guildId, new Set());
      }
      activeParticipantMap.get(p.guildId).add(p.userId);
    });
    
    // Check all servers that have active bosses or have had bosses recently
    const serversWithBosses = db.prepare(`
      SELECT DISTINCT guildId 
      FROM bosses 
      WHERE startedAt > ? OR active = 1
    `).all(Date.now() - 24 * 60 * 60 * 1000); // Check servers with bosses in last 24 hours
    
    let totalCleaned = 0;
    
    for (const serverData of serversWithBosses) {
      try {
        const guild = await client.guilds.fetch(serverData.guildId);
        if (!guild) continue;
        
        const role = guild.roles.cache.get(BOSS_FIGHTER_ROLE_ID);
        if (!role) continue;
        
        // Get all members with the boss fighter role
        const membersWithRole = role.members;
        const activeParticipants = activeParticipantMap.get(serverData.guildId) || new Set();
        
        // Find orphaned role holders
        const orphanedUsers = [];
        membersWithRole.forEach(member => {
          if (!activeParticipants.has(member.id)) {
            orphanedUsers.push(member.id);
          }
        });
        
        // Remove roles from orphaned users
        if (orphanedUsers.length > 0) {
          await cleanupBossFighterRoles(client, serverData.guildId, orphanedUsers);
          totalCleaned += orphanedUsers.length;
        }
      } catch (error) {
        console.warn(`[boss_spawner] Failed to cleanup roles in guild ${serverData.guildId}:`, error.message);
      }
    }
    
    if (totalCleaned > 0) {
      console.log(`[boss_spawner] Cleaned up ${totalCleaned} orphaned boss fighter roles across all servers`);
    }
  } catch (error) {
    console.error('[boss_spawner] Error during orphaned role cleanup:', error.message);
  }
}

module.exports = {
  BOSS_CONFIG,
  initializeBossSpawner,
  cleanupExpiredBosses,
  spawnRandomBoss,
  runBossSpawningCycle,
  getEligibleServersForBoss,
  recordBossDefeat,
  cleanupOrphanedBossFighterRoles,
  getNextSpawnInterval
};