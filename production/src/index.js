const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env';
require('dotenv').config({ path: envFile });
require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { db } = require('./utils/store_sqlite');
const { createWebServer } = require('./web/server');
const { createAutoPlacementIfMissing } = require('./web/util');
const { placeOnSpiral, findLandPosition, checkAndFixWaterServers, findNonCollidingLandPosition } = require('./utils/geo');
const logger = require('./utils/logger');
const config = require('./utils/config');
const { validateStartupConfiguration } = require('./utils/config-validator');
const { initializeBotNotifications, logBotStartup, logError, logBotShutdown, logCommandError } = require('./utils/bot_notifications');

// Validate configuration before starting
validateStartupConfiguration(config);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

client.commands = new Collection();
const cmdFiles = fs.readdirSync(path.join(__dirname, 'commands'))
  .filter(f => f.endsWith('.js') && !['_common.js', '_guard.js'].includes(f));
for (const f of cmdFiles) {
  const cmd = require(path.join(__dirname, 'commands', f));
  if (cmd.data) client.commands.set(cmd.data.name, cmd);
}

// ============================================================================
// START WEB SERVER IMMEDIATELY (Don't wait for Discord bot)
// ============================================================================
// Start the webserver immediately so the website works even if Discord bot fails
let webServerResult;
try {
  logger.info('[Web] Starting web server independent of Discord bot...');
  webServerResult = createWebServer();
  if (webServerResult && webServerResult.app) {
    // Discord client will be attached later when bot connects
    webServerResult.app.locals.discordClient = null;
    logger.info('[Web] ✅ Web server started successfully');
  } else {
    logger.error('[Web] ❌ Failed to create web server - no result returned');
  }
} catch (error) {
  logger.error('[Web] ❌ CRITICAL ERROR starting web server:');
  logger.error('[Web] Error: %s', error.message);
  logger.error('[Web] Stack: %s', error.stack);
  logger.error('Web server startup failed:', error);
}
// ============================================================================

const buckets = new Map();

// Cleanup expired rate limiting buckets every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [userId, bucket] of buckets.entries()) {
    if (now > bucket.reset) {
      buckets.delete(userId);
    }
  }
}, 600000); // Clean every 10 minutes

function hit(userId) {
  const now = Date.now();
  const lim = config.security?.commandRate || { max: 12, perMs: 10000 };
  const max = lim.max ?? 12;
  const perMs = lim.perMs ?? 10000;
  const b = buckets.get(userId) || { count: 0, reset: now + perMs };
  if (now > b.reset) {
    b.count = 0;
    b.reset = now + perMs;
  }
  b.count++; // Increment command count
  buckets.set(userId, b); // Update user's bucket
  return b.count <= max; // Return true if under limit, false if over
}

// ============================================================================
// AUTOMATIC SERVER PLACEMENT SYSTEM
// ============================================================================
// Assigns geographic coordinates to servers that don't have them
// Uses intelligent land-based placement with collision detection

/**
 * Automatically place a guild on the map if it doesn't have coordinates
 * @param {string} guildId - Discord guild ID
 */
async function autoPlaceIfNeeded(guildId) {
  const s = db.prepare('SELECT * FROM servers WHERE guildId=?').get(guildId); // Check if server exists in database
  if (!s || s.lat == null || s.lon == null) { // If server doesn't exist or lacks coordinates
    try {
      const count = db.prepare('SELECT COUNT(*) as n FROM servers').get().n; // Get total server count for spiral placement
      // Get spawn center coordinates from environment or use (0,0) as default
      const center = process.env.SPAWN_GUILD_ID ? 
        db.prepare('SELECT lat, lon FROM servers WHERE guildId=?').get(process.env.SPAWN_GUILD_ID) || { lat: 0, lon: 0 } : 
        { lat: 0, lon: 0 };
      
      // Use collision-aware placement to avoid placing servers on water or too close to others
      const pos = await findNonCollidingLandPosition(center.lat, center.lon, db);
      const biome = require('./web/util').assignBiomeDeterministic(guildId); // Assign biome based on guild ID
      
      // Update database with new coordinates and biome
      db.prepare('UPDATE servers SET lat=?, lon=?, biome=? WHERE guildId=?').run(pos.lat, pos.lon, biome, guildId);
      logger.info(`Auto-placed guild ${guildId} at ${pos.lat}, ${pos.lon} (${biome})`);
    } catch (error) {
      logger.warn(`Failed to auto-place guild ${guildId} with collision detection, using fallback:`, error.message);
      
      // Fallback to original spiral placement if advanced placement fails
      const count = db.prepare('SELECT COUNT(*) as n FROM servers').get().n; // Get server count
      const center = process.env.SPAWN_GUILD_ID ? 
        db.prepare('SELECT lat, lon FROM servers WHERE guildId=?').get(process.env.SPAWN_GUILD_ID) || { lat: 0, lon: 0 } : 
        { lat: 0, lon: 0 }; // Get spawn center
      const pos = placeOnSpiral(count, center); // Place on spiral pattern
      const biome = require('./web/util').assignBiomeDeterministic(guildId); // Assign biome
      db.prepare('UPDATE servers SET lat=?, lon=?, biome=? WHERE guildId=?').run(pos.lat, pos.lon, biome, guildId); // Update database
    }
  }
}

// ============================================================================
// BOT STATUS MANAGEMENT
// ============================================================================
// Updates the bot's Discord presence based on active boss count
// Shows "Peaceful World" when no bosses, "X Bosses Active!" when bosses are spawned

/**
 * Update bot's Discord status based on active boss count
 * Changes activity type and text to reflect current world state
 */
function updateBossStatus() {
  try {
    // Get active boss information
    const activeBoss = db.prepare('SELECT b.*, s.name as serverName FROM bosses b LEFT JOIN servers s ON b.guildId = s.guildId WHERE b.active=1 AND b.expiresAt > ? LIMIT 1')
      .get(Date.now());
    
    let status; // Status text to display
    let activityType; // Discord activity type (3=WATCHING)
    
    if (!activeBoss) {
      status = 'a peaceful world'; // No active bosses
      activityType = 3; // WATCHING activity type
    } else {
      const serverName = activeBoss.serverName || 'Unknown Server';
      status = `a boss battle in ${serverName}`; // Boss active
      activityType = 3; // WATCHING activity type
    }
    
    // Set the bot's Discord presence
    client.user.setActivity(status, { 
      type: activityType // WATCHING activity type shows as "Watching {status}"
    });
    
    logger.info('[Boss Status] Updated bot status - Watching %s', status); // Log status update
  } catch (error) {
    logger.error('[Boss Status] Failed to update bot status - %s', error.message); // Log errors
  }
}

// Export the function so it can be called from other modules (e.g., boss spawner)
module.exports = { updateBossStatus }; // Make updateBossStatus available to other files

// ============================================================================
// BOT READY EVENT - SYSTEM INITIALIZATION
// ============================================================================
// This event fires once when the bot successfully connects to Discord
// Handles all system initialization including commands, databases, and background services

client.once(Events.ClientReady, async () => {
  logger.info(`[Bot] Logged in as ${client.user.tag}`);

  // Initialize bot notification system with Discord client
  initializeBotNotifications(client);
  logger.info('[Bot] Notification system initialized');

  // Log bot startup notification via bot
  try {
    await logBotStartup(); // Send startup notification via Discord bot
    logger.info('[Bot] Startup logged to Discord');
  } catch (error) {
    logger.warn('[Bot] Failed to log startup:', error.message); // Non-critical error
  }
  
  // Auto-deploy slash commands on startup
  // This registers all bot commands with Discord so users can see and use them
  try {
    logger.info('[Deploy] Deploying slash commands...');
    require('../scripts/deploy-commands'); // Run deployment script
    logger.info('[Deploy] Slash commands deployed successfully');
  } catch (error) {
    logger.error('[Deploy] Failed to deploy slash commands:', error.message); // Log deployment failure
    await logError(error, 'Slash command deployment failed'); // Send error to webhook
  }
  
  // Initialize boss status tracking
  // Updates bot's Discord presence to show active boss count
  updateBossStatus(); // Update status immediately
  setInterval(updateBossStatus, 30000); // Update every 30 seconds
  
  // Initialize regeneration system (handles travel completion and stats recording)
  // This system processes player health/stamina regeneration and completes travel
  const { applyRegenToAll } = require('./utils/regen'); // Import regeneration functions
  applyRegenToAll(); // Run once on startup to process any pending travels
  setInterval(applyRegenToAll, 60000); // Run every 60 seconds continuously
  logger.info('[Regen] Batch regeneration system started - travel completion and stats recording active');
  

  // Initialize weekly reset system
  // Resets leaderboards and statistics every Monday at 12:00 AM
  const { initializeWeeklyReset } = require('./utils/weekly_reset'); // Import weekly reset functions
  initializeWeeklyReset(); // Setup weekly reset scheduler
  logger.info('[Weekly Reset] Weekly reset system initialized - data resets every Monday at midnight');
  
  // Initialize POI (Points of Interest) system with famous landmarks
  // Loads famous world landmarks that players can travel to and visit
  const { initializePOIs } = require('./utils/pois'); // Import POI functions
  initializePOIs(); // Load landmarks into database
  logger.info('[POI] Points of Interest system initialized - famous landmarks ready for exploration');
  
  // Bulk import all existing users from all servers to spawn server
  // This ensures all users across all servers are displayed in the spawn server
  if (process.env.SPAWN_GUILD_ID) {
    logger.info('[User Import] Starting bulk user import from all servers...');
    setTimeout(async () => {
      try {
        const { ensurePlayerWithVehicles } = require('./utils/players');
        let importCount = 0;
        
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            const members = await guild.members.fetch();
            for (const [userId, member] of members) {
              // Skip bots and users already in database
              if (member.user.bot) continue;
              
              const existingPlayer = db.prepare('SELECT userId FROM players WHERE userId=?').get(userId);
              if (existingPlayer) continue;
              
              // Create player at spawn server
              await ensurePlayerWithVehicles(client, userId, member.user.username, process.env.SPAWN_GUILD_ID);
              importCount++;
            }
          } catch (e) {
            logger.warn(`[User Import] Failed to import users from guild ${guild.name}:`, e.message);
          }
        }
        
        logger.info(`[User Import] Bulk import completed - imported ${importCount} new users to spawn server`);
      } catch (error) {
        logger.error('[User Import] Bulk import failed:', error.message);
      }
    }, 10000); // Wait 10 seconds for bot to be fully ready
  }
  
  // Initialize automatic boss spawning system with randomized 4-6 hour intervals
  const { initializeBossSpawner, runBossSpawningCycle, getNextSpawnInterval, cleanupExpiredBosses, cleanupOrphanedBossFighterRoles } = require('./utils/boss_spawner');
  initializeBossSpawner(); // Setup boss spawning system
  
  // Startup cleanup: Clean up any expired bosses and orphaned roles from previous session
  logger.info('[Boss Spawner] Running startup cleanup...');
  
  // Add a small delay to ensure bot is fully ready and guilds are cached
  setTimeout(async () => {
    try {
      const expiredCount = await cleanupExpiredBosses(client); // Clean up expired bosses and database records
      await cleanupOrphanedBossFighterRoles(client); // Clean up orphaned Discord roles
      logger.info(`[Boss Spawner] Startup cleanup completed - cleaned up ${expiredCount} expired bosses and orphaned roles`);
    } catch (error) {
      logger.warn('[Boss Spawner] Startup cleanup failed:', error.message);
    }
  }, 5000); // Wait 5 seconds for bot to be fully ready
  
  // Initial spawn cycle will be run async without blocking startup
  runBossSpawningCycle(client).catch(err => logger.warn('[Boss Spawner] Initial spawn cycle failed:', err.message)); // Run initial spawn cycle
  
  // Set up randomized spawning intervals
  function scheduleNextBossSpawn() {
    const nextInterval = getNextSpawnInterval(); // Check interval (30 seconds or time until scheduled spawn)

    // Log appropriate message based on interval type
    if (nextInterval <= 60000) {
      // Short interval = checking for spawn conditions
      logger.info(`[Boss Spawner] Boss spawn system active - checking spawn conditions every ${Math.round(nextInterval/1000)} seconds`);
    } else {
      // Long interval = time until scheduled spawn
      const minutesFromNow = Math.round(nextInterval / (1000 * 60));
      const hoursFromNow = (minutesFromNow / 60).toFixed(1);

      if (minutesFromNow < 60) {
        logger.info(`[Boss Spawner] Next boss spawn scheduled in ${minutesFromNow} minutes`);
      } else {
        logger.info(`[Boss Spawner] Next boss spawn scheduled in ${hoursFromNow} hours (${minutesFromNow} minutes)`);
      }
    }

    setTimeout(async () => {
      try {
        await runBossSpawningCycle(client);
      } catch (error) {
        logger.warn('[Boss Spawner] Scheduled spawn cycle failed:', error.message);
      }
      scheduleNextBossSpawn(); // Schedule the next one
    }, nextInterval);
  }
  
  scheduleNextBossSpawn(); // Start the randomized scheduling
  logger.info('[Boss Spawner] Automatic boss spawning system initialized - 1 hour intervals with chance-based spawning (all servers eligible)');
  
  for (const [id, guild] of client.guilds.cache) {
    const iconUrl = guild.iconURL({ extension: 'png', size: 64 });
    const exists = db.prepare('SELECT 1 FROM servers WHERE guildId=?').get(id);
    if (!exists) {
      db.prepare('INSERT INTO servers(guildId, name, ownerId, addedAt, iconUrl, archived) VALUES(?,?,?,?,?,0)').run(id, guild.name, guild.ownerId, Date.now(), iconUrl);
      logger.info('guild_add: %s (%s)', guild.name, id);
    } else {
      db.prepare('UPDATE servers SET name=?, ownerId=?, iconUrl=?, archived=0, archivedAt=NULL, archivedBy=NULL WHERE guildId=?').run(guild.name, guild.ownerId, iconUrl, id);
    }
    await autoPlaceIfNeeded(id);
  }
  createAutoPlacementIfMissing().catch(logger.error);
  
  // Check for servers in water and fix them automatically
  try {
    logger.info('Starting water check...');
    await checkAndFixWaterServers(db);
  } catch (error) {
    logger.error('Water check failed:', error.message);
  }
  
  // Attach Discord client to already-running web server for real-time stats
  if (webServerResult && webServerResult.app) {
    webServerResult.app.locals.discordClient = client;
    logger.info('[Web] Discord client attached to web server');
  }

  // Start periodic uptime status recording
  setInterval(() => {
    try {
      const realtimeStats = require('./web/routes/realtime-stats');
      if (realtimeStats && realtimeStats.recordUptimeStatus) {
        // Record online status every 5 minutes
        realtimeStats.recordUptimeStatus('online', 0);
      }
    } catch (error) {
      logger.warn('Failed to record periodic uptime status:', error.message);
    }
  }, 5 * 60 * 1000); // Record every 5 minutes

  // Ensure all guilds have a biome assigned
  try {
    for (const [id] of client.guilds.cache) {
      ensureGuildBiome(id);
    }
  } catch (e) {
    logger.warn('[Biome] ready hook error:', e.message);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  const iconUrl = guild.iconURL({ extension: 'png', size: 64 });
  const exists = db.prepare('SELECT 1 FROM servers WHERE guildId=?').get(guild.id);

  logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.aqua('🎉 BOT ADDED TO NEW SERVER');
  logger.aqua('🏰 Server: %s', guild.name);
  logger.aqua('🆔 Guild ID: %s', guild.id);
  logger.aqua('👑 Owner ID: %s', guild.ownerId);
  logger.aqua('👥 Members: %d', guild.memberCount);
  logger.aqua('⏰ Time: %s', new Date().toISOString());

  if (!exists) {
    db.prepare('INSERT INTO servers(guildId, name, ownerId, addedAt, iconUrl, archived) VALUES(?,?,?,?,?,0)').run(guild.id, guild.name, guild.ownerId, Date.now(), iconUrl);
    logger.info('✅ Server registered in database');
  } else {
    db.prepare('UPDATE servers SET name=?, ownerId=?, iconUrl=?, archived=0, archivedAt=NULL, archivedBy=NULL WHERE guildId=?').run(guild.name, guild.ownerId, iconUrl, guild.id);
    logger.info('✅ Server un-archived and updated');
  }
  
  try {
    const center = process.env.SPAWN_GUILD_ID ? db.prepare('SELECT lat, lon FROM servers WHERE guildId=?').get(process.env.SPAWN_GUILD_ID) || { lat: 0, lon: 0 } : { lat: 0, lon: 0 };
    
    // Use collision-aware land placement
    const pos = await findNonCollidingLandPosition(center.lat, center.lon, db);
    const biome = require('./web/util').assignBiomeDeterministic(guild.id);
    
    db.prepare('UPDATE servers SET lat=?, lon=?, biome=? WHERE guildId=?').run(pos.lat, pos.lon, biome, guild.id);
    logger.aqua('📍 Placed at coordinates: (%s, %s) | Biome: %s', pos.lat, pos.lon, biome);
    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    logger.error('Error placing guild with collision detection: %s', error.message);
    // Fallback to original placement if advanced placement fails
    const count = db.prepare('SELECT COUNT(*) as n FROM servers').get().n;
    const center = process.env.SPAWN_GUILD_ID ? db.prepare('SELECT lat, lon FROM servers WHERE guildId=?').get(process.env.SPAWN_GUILD_ID) || { lat: 0, lon: 0 } : { lat: 0, lon: 0 };
    const pos = placeOnSpiral(count, center);
    const biome = require('./web/util').assignBiomeDeterministic(guild.id);
    db.prepare('UPDATE servers SET lat=?, lon=?, biome=? WHERE guildId=?').run(pos.lat, pos.lon, biome, guild.id);
    logger.aqua('📍 Placed at coordinates (fallback): (%s, %s) | Biome: %s', pos.lat, pos.lon, biome);
    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
});

client.on(Events.GuildDelete, (guild) => {
  db.prepare('UPDATE servers SET archived=1, archivedAt=?, archivedBy=? WHERE guildId=?').run(Date.now(), 'system', guild.id);

  logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.aqua('👋 BOT REMOVED FROM SERVER');
  logger.aqua('🏰 Server: %s', guild.name);
  logger.aqua('🆔 Guild ID: %s', guild.id);
  logger.aqua('📦 Server archived (data preserved)');
  logger.aqua('⏰ Time: %s', new Date().toISOString());
});

// Handle new members joining ANY server - add them to spawn server display
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    // Skip bots
    if (member.user.bot) {
      return;
    }
    
    // Skip if no spawn server configured
    if (!process.env.SPAWN_GUILD_ID) {
      return;
    }
    
    // Import player utilities for creating new users
    const { ensurePlayerWithVehicles } = require('./utils/players');
    
    // Create new player and place them at spawn server (regardless of which server they joined)
    await ensurePlayerWithVehicles(client, member.user.id, member.user.username, process.env.SPAWN_GUILD_ID);

    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.aqua('🆕 NEW USER JOINED');
    logger.aqua('👤 User: %s (@%s)', member.user.username, member.user.id);
    logger.aqua('🏰 Joined Server: %s', member.guild.name);
    logger.aqua('✅ Registered at spawn server');
    logger.aqua('⏰ Time: %s', new Date().toISOString());
    
  } catch (error) {
    logger.error('Failed to handle new member join: %s', error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd && cmd.autocomplete) return cmd.autocomplete(interaction);
      return;
    }
    if (interaction.isButton()) {
      // Handle button interactions
      if (interaction.customId.startsWith('market_buy_')) {
        const listingId = parseInt(interaction.customId.replace('market_buy_', ''));
        
        // Import the market command and use its buy logic
        const marketCommand = require('./commands/market');
        
        // Create a proper fake interaction object for the buy subcommand
        const fakeInteraction = {
          ...interaction,
          user: interaction.user,
          client: interaction.client,
          guildId: interaction.guildId,
          reply: interaction.reply.bind(interaction),
          followUp: interaction.followUp.bind(interaction),
          options: {
            getSubcommand: () => 'buy',
            getInteger: (name) => name === 'listing' ? listingId : null
          }
        };
        
        try {
          await marketCommand.execute(fakeInteraction);
        } catch (error) {
          logger.error('Button interaction error:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Error processing purchase.', ephemeral: true });
          }
        }
        return;
      }
      
      // Handle security ban/unban buttons
      if (interaction.customId.startsWith('security_ban_') || interaction.customId.startsWith('security_unban_')) {
        const { isStaffOrDev } = require('./utils/roles');
        const { db, generateBanId } = require('./utils/store_sqlite');
        const { normalizeIP } = require('./utils/ip_bans');
        const { EmbedBuilder } = require('discord.js');

        // Check if user is staff/dev
        if (!(await isStaffOrDev(interaction.client, interaction.user.id))) {
          return interaction.reply({
            content: '❌ Only Staff and Developers can use these buttons.',
            ephemeral: true
          });
        }

        const isBan = interaction.customId.startsWith('security_ban_');
        const ip = normalizeIP(interaction.customId.replace(isBan ? 'security_ban_' : 'security_unban_', ''));

        if (isBan) {
          // Ban the IP
          const existingBan = db.prepare('SELECT * FROM ip_bans WHERE ip=?').get(ip);

          if (existingBan) {
            return interaction.reply({
              content: `❌ IP address **${ip}** is already banned.`,
              ephemeral: true
            });
          }

          const banId = generateBanId();
          const expiresAt = null; // Permanent ban

          // Get the original message that triggered this button click to extract context
          const originalMessage = interaction.message;
          let reason = 'Suspicious activity - Security violation';

          // Try to extract attack details from the original message embed
          if (originalMessage && originalMessage.embeds && originalMessage.embeds.length > 0) {
            const embed = originalMessage.embeds[0];

            // Check if this is from a security alert
            if (embed.title && embed.title.includes('Security Alert')) {
              // Extract the targeted endpoints field to get attack types
              const targetedField = embed.fields.find(f => f.name && f.name.includes('Targeted Endpoints'));

              if (targetedField && targetedField.value) {
                // Extract attack reasons from the endpoints list
                const attackTypes = [];
                const lines = targetedField.value.split('\n');

                for (const line of lines) {
                  // Match patterns like "• `/admin` (3x) - *Admin path probing*"
                  const reasonMatch = line.match(/\*([^*]+)\*/);
                  if (reasonMatch) {
                    const attackType = reasonMatch[1];
                    if (!attackTypes.includes(attackType)) {
                      attackTypes.push(attackType);
                    }
                  }
                }

                // Build reason from attack types
                if (attackTypes.length > 0) {
                  if (attackTypes.length === 1) {
                    reason = attackTypes[0];
                  } else if (attackTypes.length === 2) {
                    reason = `${attackTypes[0]} and ${attackTypes[1]}`;
                  } else {
                    reason = `${attackTypes[0]}, ${attackTypes[1]}, and ${attackTypes.length - 2} other attacks`;
                  }
                } else {
                  reason = 'Multiple security violations';
                }
              } else {
                reason = 'Security alert - Suspicious activity detected';
              }
            } else if (embed.title && embed.title.includes('Automatic IP Ban')) {
              reason = 'Rate limit violation - Automated scanning detected';
            }
          }

          db.prepare(`
            INSERT INTO ip_bans(banId, ip, reason, bannedBy, bannedAt, expiresAt)
            VALUES(?,?,?,?,?,?)
          `).run(banId, ip, reason, interaction.user.id, Date.now(), expiresAt);

          logger.info('security_ban: %s permanently banned IP %s for: %s (Ban ID: %s)', interaction.user.id, ip, reason, banId);

          const embed = new EmbedBuilder()
            .setTitle('🔨 IP Address Banned')
            .setDescription(`**${ip}** has been banned from accessing the bot and website`)
            .setColor(0xFF0000)
            .addFields(
              { name: '🌐 IP Address', value: `\`${ip}\``, inline: true },
              { name: '⏰ Duration', value: '**Permanent**', inline: true },
              { name: '🆔 Ban ID', value: `\`${banId}\``, inline: true },
              { name: '📝 Reason', value: reason, inline: false },
              { name: '👤 Banned By', value: `${interaction.user.username}`, inline: true },
              { name: '⏰ Expires', value: 'Never', inline: true }
            )
            .setFooter({ text: 'QuestCord Security System', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
        } else {
          // Unban the IP
          const existingBan = db.prepare('SELECT * FROM ip_bans WHERE ip=?').get(ip);

          if (!existingBan) {
            return interaction.reply({
              content: `❌ IP address **${ip}** is not currently banned.`,
              ephemeral: true
            });
          }

          db.prepare('DELETE FROM ip_bans WHERE ip=?').run(ip);
          logger.info('security_unban: %s unbanned IP %s (Previously: %s)', interaction.user.id, ip, existingBan.reason);

          const embed = new EmbedBuilder()
            .setTitle('✅ IP Address Unbanned')
            .setDescription(`**${ip}** has been unbanned and can now access the bot and website`)
            .setColor(0x00FF00)
            .addFields(
              { name: '🌐 IP Address', value: `\`${ip}\``, inline: true },
              { name: '📝 Previous Reason', value: existingBan.reason, inline: false },
              { name: '👤 Unbanned By', value: `${interaction.user.username}`, inline: true },
              { name: '⏰ Unbanned At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'QuestCord Security System', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
        }
        return;
      }

      // Handle quick sell buttons
      if (interaction.customId.startsWith('quick_sell_')) {
        const itemId = interaction.customId.replace('quick_sell_', '');
        const { itemById } = require('./utils/items');
        const item = itemById(itemId);
        
        if (!item) {
          return interaction.reply({ content: '❌ Item not found.', ephemeral: true });
        }
        
        // Create modal for price input
        const modal = new ModalBuilder()
          .setCustomId(`sell_modal_${itemId}`)
          .setTitle(`Sell ${item.name}`);
        
        // Price input
        const priceInput = new TextInputBuilder()
          .setCustomId('sell_price')
          .setLabel('Price per item (in Drakari)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter price (e.g. 100)')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(10);
        
        // Quantity input
        const qtyInput = new TextInputBuilder()
          .setCustomId('sell_quantity')
          .setLabel('Quantity to sell')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter quantity (e.g. 5)')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(10);
        
        // Duration input
        const durationInput = new TextInputBuilder()
          .setCustomId('sell_duration')
          .setLabel('⏰ Listing Duration')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('10m, 1h, 6h, 12h, or 24h')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(4);
        
        const priceRow = new ActionRowBuilder().addComponents(priceInput);
        const qtyRow = new ActionRowBuilder().addComponents(qtyInput);
        const durationRow = new ActionRowBuilder().addComponents(durationInput);
        
        modal.addComponents(priceRow, qtyRow, durationRow);
        
        await interaction.showModal(modal);
        return;
      }
    }
    
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('sell_modal_')) {
        const itemId = interaction.customId.replace('sell_modal_', '');
        const price = parseInt(interaction.fields.getTextInputValue('sell_price'));
        const qty = parseInt(interaction.fields.getTextInputValue('sell_quantity'));
        const duration = interaction.fields.getTextInputValue('sell_duration');
        
        // Validate inputs
        if (isNaN(price) || price <= 0) {
          return interaction.reply({ content: '❌ Invalid price. Please enter a positive number.', ephemeral: true });
        }
        
        if (isNaN(qty) || qty <= 0) {
          return interaction.reply({ content: '❌ Invalid quantity. Please enter a positive number.', ephemeral: true });
        }
        
        if (!['10m', '1h', '6h', '12h', '24h'].includes(duration)) {
          return interaction.reply({ content: '❌ Invalid duration. Use: 10m, 1h, 6h, 12h, or 24h', ephemeral: true });
        }
        
        // Check listing limits
        const { isPremium } = require('./utils/roles');
        const isPremiumUser = await isPremium(interaction.client, interaction.user.id);
        const maxListings = isPremiumUser ? 5 : 2;
        
        const currentListings = db.prepare('SELECT COUNT(*) as count FROM market_listings WHERE sellerId = ? AND expiresAt > ?')
          .get(interaction.user.id, Date.now());
        
        if (currentListings.count >= maxListings) {
          return interaction.reply({ 
            content: `❌ Market listing limit reached! ${isPremiumUser ? 'Premium users' : 'Users'} can have up to **${maxListings}** active listings.\n\nCancel existing listings with \`/market cancel <listing_id>\` or upgrade to premium for more slots.`, 
            ephemeral: true 
          });
        }
        
        // Create listing directly instead of using disabled subcommand
        try {
          const { itemById, isTradable } = require('./utils/items');
          const config = require('./utils/config');
          const { getUserPrefix } = require('./utils/roles');
          const logger = require('./utils/logger');
          const { EmbedBuilder } = require('discord.js');
          
          const userPrefix = await getUserPrefix(interaction.client, interaction.user);
          const item = itemById(itemId);
          
          if (!item) {
            return interaction.reply({ content: `${userPrefix} Item not found.`, ephemeral: true });
          }
          
          if (!isTradable(itemId)) {
            return interaction.reply({ content: `${userPrefix} This item cannot be traded.`, ephemeral: true });
          }
          
          // Check inventory
          const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(interaction.user.id, itemId);
          if (!inv || inv.qty < qty) {
            return interaction.reply({ content: `${userPrefix} Not enough items in inventory.`, ephemeral: true });
          }
          
          // Calculate expiration time
          const mult = { '10m': 600, '1h': 3600, '6h': 21600, '12h': 43200, '24h': 86400 }[duration];
          let actualExpires = Date.now() + mult * 1000;
          
          // Premium users get 2x listing duration
          if (isPremiumUser) {
            actualExpires = Date.now() + (mult * 2 * 1000);
          }
          
          // Calculate listing fee (premium users get 50% off)
          const listingFee = Math.floor(price * 0.02); // 2% listing fee
          const actualFee = isPremiumUser ? Math.floor(listingFee * 0.5) : listingFee;
          
          const playerBalance = db.prepare('SELECT drakari FROM players WHERE userId=?').get(interaction.user.id);
          if (!playerBalance || playerBalance.drakari < actualFee) {
            return interaction.reply({ 
              content: `${userPrefix} Insufficient funds for listing fee. Required: ${actualFee} ${config.currencyName}`, 
              ephemeral: true 
            });
          }
          
          // Deduct items from inventory and listing fee
          db.prepare('UPDATE inventory SET qty=qty-? WHERE userId=? AND itemId=?').run(qty, interaction.user.id, itemId);
          db.prepare('DELETE FROM inventory WHERE qty<=0').run();
          db.prepare('UPDATE players SET drakari=drakari-? WHERE userId=?').run(actualFee, interaction.user.id);
          
          // Create market listing
          const info = db.prepare('INSERT INTO market_listings(sellerId,itemId,qty,price,expiresAt) VALUES(?,?,?,?,?)').run(interaction.user.id, itemId, qty, price, actualExpires);
          logger.info('market_list: user %s listed %s x%s for %s', interaction.user.id, itemId, qty, price);
          
          // Create success embed
          const listingEmbed = new EmbedBuilder()
            .setTitle('MARKETPLACE LISTING CREATED')
            .setDescription(`Your **${item.name}** is now available for purchase!`)
            .setColor(0x00FF00)
            .addFields(
              {
                name: '**Listed Item**',
                value: `**${item.name}** × ${qty}${isPremiumUser ? ' [PREMIUM]' : ''}`,
                inline: true
              },
              {
                name: '**Asking Price**',
                value: `${price.toLocaleString()} ${config.currencyName}\n(${Math.round(price/qty).toLocaleString()} each)`,
                inline: true
              },
              {
                name: '**Listing ID**',
                value: `**#${info.lastInsertRowid}**\nUse for buy/cancel`,
                inline: true
              },
              {
                name: '**Listing Fee**',
                value: `${actualFee.toLocaleString()} ${config.currencyName}${isPremiumUser ? ' (50% off)' : ''}\n${((actualFee/price)*100).toFixed(1)}% of price`,
                inline: true
              },
              {
                name: '**Duration**',
                value: `${duration}${isPremiumUser ? ' × 2 (premium bonus)' : ''}\nExpires: <t:${Math.floor(actualExpires/1000)}:R>`,
                inline: true
              },
              {
                name: '**Sale Tax**',
                value: `${config.marketTaxPct}% on sale\n(${Math.floor(price * (config.marketTaxPct/100)).toLocaleString()} ${config.currencyName})`,
                inline: true
              }
            );
            
          listingEmbed.setFooter({ 
            text: `${isPremiumUser ? 'Premium listings get priority display' : 'Use /market browse to see all listings'} • QuestCord`,
            iconURL: interaction.client.user.displayAvatarURL()
          }).setTimestamp();

          await interaction.reply({ embeds: [listingEmbed] });
          
        } catch (error) {
          logger.error('Modal submission error:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Error listing item for sale. Please try again.', ephemeral: true });
          }
        }
        return;
      }
    }
    
    if (!interaction.isChatInputCommand()) return;

    // Check rate limiting and log if user is rate limited
    if (!hit(interaction.user.id)) {
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('⚠️  RATE LIMITED');
      logger.warn('👤 User: %s (@%s)', interaction.user.username, interaction.user.id);
      logger.warn('📋 Attempted Command: /%s', interaction.commandName);
      logger.warn('🏰 Server: %s', interaction.guild ? interaction.guild.name : 'DM');
      logger.warn('⏰ Time: %s', new Date().toISOString());
      return interaction.reply({ content: 'Slow down a bit.', ephemeral: true });
    }
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    
    // Create context object that commands expect
    const ctx = {
      db,
      config,
      tag: (s) => `\`${s}\``, // Simple tag function
      fetchRoleLevel: require('./web/util').fetchRoleLevel,
      log: (event, data) => logger.info('cmd_%s: %s', event, JSON.stringify(data))
    };
    
    // Log detailed command execution information before executing
    const guild = interaction.guild;
    const guildName = guild ? guild.name : 'DM';
    const username = interaction.user.username;
    const userId = interaction.user.id;

    // Extract command options/parameters for logging
    let optionsStr = '';
    try {
      if (interaction.options && interaction.options.data && interaction.options.data.length > 0) {
        const opts = interaction.options.data.map(opt => {
          if (opt.type === 1 || opt.type === 2) { // SUB_COMMAND or SUB_COMMAND_GROUP
            return `${opt.name}`;
          }
          return `${opt.name}=${opt.value}`;
        }).join(', ');
        optionsStr = opts ? ` [${opts}]` : '';
      }
    } catch (e) {
      // Ignore option parsing errors
    }

    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.aqua('📋 COMMAND EXECUTED: /%s%s', interaction.commandName, optionsStr);
    logger.aqua('👤 User: %s (@%s)', username, userId);
    logger.aqua('🏰 Server: %s (%s)', guildName, interaction.guildId || 'N/A');
    logger.aqua('⏰ Time: %s', new Date().toISOString());

    await cmd.execute(interaction);

    logger.info('✅ Command completed successfully: /%s', interaction.commandName);

    // Record command usage for real-time statistics and live activity feed
    try {
      const { logCommand } = require('./utils/store_sqlite');
      // Pass the entire interaction object so logCommand can extract username
      logCommand(interaction, interaction.commandName, interaction.guildId);
    } catch (statsError) {
      // Don't let stats tracking errors affect command execution
      logger.warn('Failed to record command usage:', statsError.message);
    }
  } catch (e) {
    // Log detailed error information
    const guild = interaction.guild;
    const guildName = guild ? guild.name : 'DM';
    const username = interaction.user.username;
    const userId = interaction.user.id;

    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.error('❌ COMMAND ERROR: /%s', interaction.commandName);
    logger.error('👤 User: %s (@%s)', username, userId);
    logger.error('🏰 Server: %s (%s)', guildName, interaction.guildId || 'N/A');
    logger.error('⚠️  Error: %s', e?.message || 'Unknown error');
    logger.error('📍 Stack: %s', e?.stack || 'No stack trace');
    logger.error('⏰ Time: %s', new Date().toISOString());

    // Record failed command usage for statistics
    try {
      const { logCommand } = require('./utils/store_sqlite');
      // Still log failed commands for activity tracking
      logCommand(interaction, interaction.commandName, interaction.guildId);
    } catch (statsError) {
      logger.warn('Failed to record failed command usage:', statsError.message);
    }

    // Log command error to webhook
    try {
      await logCommandError(interaction.commandName, interaction.user.id, interaction.guildId, e);
    } catch (webhookError) {
      logger.warn('[Webhook] Failed to log command error:', webhookError.message);
    }

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) interaction.followUp({ content: 'Error executing command.', ephemeral: true });
      else interaction.reply({ content: 'Error executing command.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// Handle uncaught exceptions and log them
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', error);
  try {
    await logError(error, 'Uncaught Exception');
  } catch (webhookError) {
    logger.warn('Failed to log uncaught exception:', webhookError.message);
  }
  process.exit(1);
});

// Handle unhandled promise rejections and log them
process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    await logError(new Error(`Unhandled Rejection: ${reason}`), 'Unhandled Promise Rejection');
  } catch (webhookError) {
    logger.warn('Failed to log unhandled rejection:', webhookError.message);
  }
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\nReceived SIGINT. Graceful shutdown initiated...');
  try {
    await logBotShutdown('Manual shutdown (SIGINT)');
    logger.info('Shutdown logged to Discord');
  } catch (webhookError) {
    logger.warn('Failed to log shutdown:', webhookError.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\nReceived SIGTERM. Graceful shutdown initiated...');
  try {
    await logBotShutdown('System shutdown (SIGTERM)');
    logger.info('Shutdown logged to Discord');
  } catch (webhookError) {
    logger.warn('Failed to log shutdown:', webhookError.message);
  }
  process.exit(0);
});

// Ensure a guild has a biome assigned; if missing, assign randomly from config.biomes
function ensureGuildBiome(guildId) {
  try {
    const row = db.prepare('SELECT biome FROM servers WHERE guildId=?').get(guildId);
    if (!row) return;
    if (!row.biome || !String(row.biome).trim()) {
      const arr = Array.isArray(config.biomes) && config.biomes.length ? config.biomes : [
        'Volcanic','Ruins','Swamp','Water','Forest','Ice','Meadow','Mountain'
      ];
      const pick = arr[Math.floor(Math.random() * arr.length)];
      db.prepare('UPDATE servers SET biome=?, tokens=COALESCE(tokens, 1) WHERE guildId=?')
        .run(String(pick).toLowerCase(), guildId);
      logger.info('[Biome] Assigned random biome to guild', guildId, '→', pick);
    }
  } catch (e) { logger.warn('[Biome] ensureGuildBiome error:', e.message); }
}




