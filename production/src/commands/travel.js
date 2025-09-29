const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { haversine } = require('../utils/geo');
const config = require('../utils/config');
const { isPremium, getUserPrefix } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const logger = require('../utils/logger');
const { itemById } = require('../utils/items');
const { ensurePlayerWithVehicles } = require('../utils/players');
const { getAllPOIs, getPOIById, calculateDistance, hasVisitedPOI, visitPOI } = require('../utils/pois');

async function vehicleSpeed(client, userId) {
  if (await isPremium(client, userId)) {
    return config.vehicles?.private_jet?.speedMultiplier || 3.0;
  }
  return config.vehicles?.plane?.speedMultiplier || 1.0;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('travel')
    .setDescription('Travel to a server or famous landmark')
    .addStringOption(o =>
      o.setName('destination_type')
       .setDescription('Choose destination type')
       .setRequired(true)
       .addChoices(
         { name: 'Server', value: 'server' },
         { name: 'Landmark', value: 'landmark' }
       )
    )
    .addStringOption(o =>
      o.setName('target')
       .setDescription('Server name/ID or landmark name')
       .setRequired(true)
       .setAutocomplete(true)
    ),

  /**
   * Autocomplete handler that provides intelligent destination suggestions
   * Filters and sorts results based on distance, travel status, and user input
   * 
   * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
   */
  async autocomplete(interaction) {
    // Get the current user input and which option is being focused
    const focusedValue = interaction.options.getFocused();
    const focusedOption = interaction.options.getFocused(true);
    const destinationType = interaction.options.getString('destination_type');
    const userId = interaction.user.id;

    try {
      // Get user's current location and travel status from database
      const player = db.prepare(`
        SELECT locationGuildId, travelArrivalAt
        FROM players WHERE userId=?
      `).get(userId) || {};

      // Prevent autocomplete suggestions if user is currently traveling
      if (player.travelArrivalAt && player.travelArrivalAt > Date.now()) {
        return interaction.respond([
          { name: 'You are currently traveling', value: 'traveling' }
        ]);
      }

      // Determine current location for distance calculations
      const currentGuildId = player.locationGuildId || interaction.guildId;
      const currentServer = db.prepare('SELECT lat, lon FROM servers WHERE guildId=? ORDER BY addedAt DESC LIMIT 1').get(currentGuildId);

      // Handle landmark autocomplete suggestions
      if (focusedOption.name === 'target' && destinationType === 'landmark') {
        // Get all available Points of Interest (landmarks)
        const pois = getAllPOIs();
        // Filter landmarks based on user's search input (name or country)
        const filtered = pois.filter(poi => 
          poi.name.toLowerCase().includes(focusedValue.toLowerCase()) ||
          poi.country.toLowerCase().includes(focusedValue.toLowerCase())
        );

        // Calculate distances and add visit status for each landmark
        const suggestions = filtered.slice(0, 25).map(poi => {
          let distance = '?';
          // Calculate distance if current server has coordinates
          if (currentServer && currentServer.lat != null) {
            distance = Math.round(calculateDistance(currentServer.lat, currentServer.lon, poi.lat, poi.lon));
          }
          
          // Check if user has visited this landmark before
          const visited = hasVisitedPOI(userId, poi.id);
          // Show checkmark if visited, gem cost if not visited
          const status = visited ? '✅' : '💎' + poi.visitCost;
          
          // Format suggestion with emoji, name, country, distance, and status
          return {
            name: `${poi.emoji} ${poi.name} (${poi.country}) • ${distance}km • ${status}`,
            value: poi.id
          };
        });

        return interaction.respond(suggestions);
      }

      // Handle server autocomplete (default or when destination_type is 'server')
      if (!destinationType || destinationType === 'server') {
        // If current server has no coordinates, show basic server list
        if (!currentServer || currentServer.lat == null || currentServer.lon == null) {
          // No location data available, just show some servers alphabetically
          const servers = db.prepare(`
            SELECT guildId, name FROM servers 
            WHERE archived=0 AND name IS NOT NULL 
            ORDER BY name LIMIT 10
          `).all();

          // Format basic server choices without distance information
          const choices = servers.map(s => ({
            name: s.name,
            value: s.name
          }));

          return interaction.respond(choices);
        }

        // Get all active servers with coordinates (excluding current location)
        // Use GROUP BY to ensure each server appears only once, taking the most recent entry
        const servers = db.prepare(`
          SELECT guildId, name, lat, lon FROM servers
          WHERE archived=0 AND guildId != ? AND name IS NOT NULL
          AND lat IS NOT NULL AND lon IS NOT NULL
          GROUP BY guildId
          ORDER BY addedAt DESC
        `).all(currentGuildId);

        // Calculate distances using haversine formula for all servers
        const serversWithDistance = servers.map(s => {
          const distance = haversine(
            currentServer.lat, currentServer.lon,
            s.lat, s.lon
          );
          return { ...s, distance };
        });

        // Sort by distance (closest first) and limit to top 10
        serversWithDistance.sort((a, b) => a.distance - b.distance);
        const closest = serversWithDistance.slice(0, 10);

        // Filter results based on user's search input
        const filtered = closest.filter(s => 
          s.name.toLowerCase().includes(focusedValue.toLowerCase())
        );

        // Format server choices with distance information
        const choices = filtered.slice(0, 10).map(s => ({
          name: `${s.name} (${Math.round(s.distance)}km)`,
          value: s.name
        }));

        return interaction.respond(choices);
      }
    } catch (error) {
      // Log autocomplete errors and return empty array to prevent crashes
      console.error('Travel autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  /**
   * Main execution handler for the travel command
   * Routes to appropriate handler based on destination type (server or landmark)
   * 
   * @param {CommandInteraction} interaction - Discord slash command interaction
   */
  async execute(interaction) {
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'travel', interaction.guild?.id);

    // Get user's display prefix (premium users get special prefixes)
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    // Check if user is banned from using the bot
    if (isBanned(interaction.user.id)) return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });

    // Regenerate user's stamina based on time passed since last update
    regenStamina(interaction.user.id);

    // Extract command options from user input
    const destinationType = interaction.options.getString('destination_type');
    const target = interaction.options.getString('target');
    
    // Route to appropriate travel handler based on destination type
    if (destinationType === 'landmark') {
      // Handle landmark travel using POI ID
      return this.handleLandmarkTravelById(interaction, userPrefix, target);
    } else {
      // Handle server travel using server name/ID
      return this.handleServerTravel(interaction, userPrefix, target);
    }
  },

  /**
   * Handles landmark travel by POI ID - validates prerequisites and routes to main travel handler
   * Checks gem costs, validates landmark existence, and prepares landmark data
   * 
   * @param {CommandInteraction} interaction - Discord command interaction
   * @param {string} userPrefix - User's display prefix (premium/regular)
   * @param {string} landmarkId - The POI ID of the landmark to visit
   */
  async handleLandmarkTravelById(interaction, userPrefix, landmarkId) {
    try {
      const userId = interaction.user.id;
      // Fetch landmark data from POI system
      const poi = getPOIById(landmarkId);
      
      // Validate that the landmark exists
      if (!poi) {
        return interaction.reply({
          content: `${userPrefix} Landmark not found.`,
          ephemeral: true
        });
      }

      // Ensure player record exists with vehicle data
      const player = await ensurePlayerWithVehicles(interaction.client, userId, interaction.user.username, interaction.guild?.id);
      
      // Check if user has enough gems to pay the landmark visit cost
      if ((player.gems || 0) < poi.visitCost) {
        return interaction.reply({
          content: `${userPrefix} Insufficient gems! You need ${poi.visitCost} 💎 gems to visit ${poi.name}. You have ${player.gems || 0}.`,
          ephemeral: true
        });
      }
      
      // Check if user has visited this landmark before (affects rewards)
      const alreadyVisited = hasVisitedPOI(userId, landmarkId);
      
      // Transform POI data into destination format compatible with travel system
      // This allows landmarks to use the same travel mechanics as server travel
      const landmarkAsDestination = {
        guildId: `landmark_${landmarkId}`,  // Unique identifier for landmark location
        name: poi.name,                     // Display name of landmark
        lat: poi.lat,                      // Latitude coordinate
        lon: poi.lon,                      // Longitude coordinate
        isLandmark: true,                  // Flag to identify landmark travel
        landmarkId: landmarkId,            // Original POI ID
        visitCost: poi.visitCost,          // Gem cost to visit
        emoji: poi.emoji,                  // Landmark emoji for displays
        country: poi.country,              // Country where landmark is located
        alreadyVisited: alreadyVisited     // Whether user has visited before
      };
      
      // Route to the main landmark travel handler with prepared destination data
      return await this.handleLandmarkTravel(interaction, userPrefix, landmarkAsDestination);
        
    } catch (error) {
      // Log landmark travel errors and return user-friendly error message
      console.error('Landmark travel error:', error);
      return interaction.reply({
        content: `${userPrefix} ${error.message}`,
        ephemeral: true
      });
    }
  },

  /**
   * Handles the actual landmark travel process - calculates travel time, deducts costs, and creates travel embed
   * This function mirrors server travel but with landmark-specific features like gem costs and visit tracking
   * 
   * @param {CommandInteraction} interaction - Discord command interaction
   * @param {string} userPrefix - User's display prefix
   * @param {Object} dest - Destination object with landmark data
   */
  async handleLandmarkTravel(interaction, userPrefix, dest) {
    // Get or create player record with vehicle information
    let p = await ensurePlayerWithVehicles(interaction.client, interaction.user.id, interaction.user.username, interaction.guild?.id);
    // Get the server data for the player's current location
    let fromServer = db.prepare('SELECT * FROM servers WHERE guildId=? AND archived=0 ORDER BY addedAt DESC LIMIT 1').get(p.locationGuildId || interaction.guild?.id);

    // If currently at a landmark, get the actual server they traveled from originally
    // This ensures proper distance calculation from their last real server location
    if (p.locationGuildId && p.locationGuildId.startsWith('landmark_')) {
      fromServer = db.prepare('SELECT * FROM servers WHERE guildId=? AND archived=0 ORDER BY addedAt DESC LIMIT 1').get(p.travelFromGuildId || interaction.guild?.id);
    }

    // Fallback to current guild's server if no valid origin server found
    if (!fromServer || fromServer.lat == null) {
      fromServer = db.prepare('SELECT * FROM servers WHERE guildId=? AND archived=0 ORDER BY addedAt DESC LIMIT 1').get(interaction.guild?.id);
    }
    
    // Get travel configuration settings with fallback defaults
    const tcfg = config.travel || {};
    const minS = tcfg.minSeconds ?? 60;        // Minimum travel time (1 minute)
    const maxS = tcfg.maxSeconds ?? 600;       // Maximum travel time (10 minutes)
    const distMult = tcfg.distanceMultiplier ?? 0.2; // Distance to time conversion factor


    // Initialize travel time with minimum duration as fallback
    let timeSec = minS;
    if (fromServer && fromServer.lat != null) {
      // Calculate distance
      const d = haversine(fromServer.lat, fromServer.lon, dest.lat, dest.lon);
      // Get user's vehicle speed multiplier (premium users travel faster)
      const mult = await vehicleSpeed(interaction.client, interaction.user.id);
      // Calculate base travel time: minimum + (distance * multiplier) / vehicle speed
      let base = minS + (d * distMult) / mult;

      // Get player's current stamina for travel time reduction calculation
      const staminaRow = db.prepare('SELECT stamina FROM players WHERE userId=?').get(interaction.user.id);
      const stamina = staminaRow?.stamina || 0;
      // Calculate stamina-based travel time reduction (up to 50% faster with high stamina)
      const maxReduction = (config.stamina?.travelMaxReductionPct ?? 50) / 100;
      const staminaFactor = 1 - Math.min(maxReduction, stamina / 200);
      timeSec = Math.round(base * staminaFactor);
      // Enforce minimum and maximum travel time limits
      if (timeSec < minS) timeSec = minS;
      if (timeSec > maxS) timeSec = maxS;
      
      // Deduct stamina cost for travel and update player record
      const spend = config.stamina?.travelCost ?? 10;
      const newSt = Math.max(0, stamina - spend);
      db.prepare('UPDATE players SET stamina=?, staminaUpdatedAt=? WHERE userId=?').run(newSt, Date.now(), interaction.user.id);
    }
    
    // Calculate exact arrival timestamp (current time + travel duration)
    const arrival = Date.now() + timeSec * 1000;
    
    // Deduct gem cost for landmark travel from player's balance
    db.prepare('UPDATE players SET gems = COALESCE(gems, 0) - ? WHERE userId = ?').run(dest.visitCost, interaction.user.id);
    
    // Update player's travel state in database
    // travelArrivalAt: When travel completes (future timestamp)
    // travelStartAt: When travel began (current timestamp)
    // locationGuildId: Set to landmark ID during travel
    // travelFromGuildId: Remember original server for return navigation
    db.prepare('UPDATE players SET travelArrivalAt=?, travelStartAt=?, locationGuildId=?, travelFromGuildId=? WHERE userId=?').run(
      arrival, Date.now(), dest.guildId, fromServer ? fromServer.guildId : null, interaction.user.id
    );

    // Record travel activity for real-time statistics
    try {
      const realtimeStats = require('../web/routes/realtime-stats');
      if (realtimeStats && realtimeStats.recordTravel) {
        realtimeStats.recordTravel(interaction.user.id, fromServer ? fromServer.guildId : null, dest.guildId);
      }
    } catch (statsError) {
      // Don't let stats tracking errors affect travel execution
      console.warn('Failed to record travel activity:', statsError.message);
    }
    
    // Get web base URL for map links (if configured)
    const base = (config.web && config.web.publicBaseUrl || '').replace(/\/$/, '');
    // Check premium status for enhanced embed styling and features
    const isPremiumUser = await isPremium(interaction.client, interaction.user.id);
    // Get speed multiplier for display in embed
    const speedMult = await vehicleSpeed(interaction.client, interaction.user.id);
    
    // Calculate actual distance for display purposes
    const distance = fromServer && fromServer.lat != null ? 
      haversine(fromServer.lat, fromServer.lon, dest.lat, dest.lon) : 0;
    
    const travelEmbed = new EmbedBuilder()
      .setTitle(`🏛️ Traveling to ${dest.name}`)
      .setDescription(`${dest.alreadyVisited ? '🔄 Returning to a familiar landmark' : '✨ Discovering a new landmark for the first time!'}`)
      .setColor(isPremiumUser ? 0xFFD700 : 0x5865F2)
      .setAuthor({
        name: `${interaction.user.displayName} - Explorer`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setThumbnail(`https://cdn.discordapp.com/emojis/${dest.emoji ? '1234567890123456789' : '1234567890123456789'}.png`)
      .addFields(
        {
          name: '✈️ Transportation',
          value: `**${isPremiumUser ? 'Private Jet' : 'Commercial Flight'}**\n• Speed: ${speedMult}x multiplier`,
          inline: true
        },
        {
          name: '🎯 Destination',
          value: `**${dest.name}** ${dest.emoji}\n🗺️ ${dest.country}`,
          inline: true
        },
        {
          name: '📏 Travel Details',
          value: `**Distance:** ${Math.round(distance)} km\n**ETA:** ${Math.round(timeSec / 60)} minutes`,
          inline: true
        },
        {
          name: '💰 Journey Cost',
          value: `**${dest.visitCost}** 💎 gems\n⚡ **${config.stamina?.travelCost ?? 10}** stamina`,
          inline: true
        },
        {
          name: '🎆 Visit Status',
          value: dest.alreadyVisited ? '✅ **Return Visit**\nFamiliar territory' : '🎆 **First Discovery**\nUncharted adventure!',
          inline: true
        },
        {
          name: '🕰️ Arrival Time',
          value: `<t:${Math.floor((Date.now() + timeSec * 1000) / 1000)}:t>\n<t:${Math.floor((Date.now() + timeSec * 1000) / 1000)}:R>`,
          inline: true
        }
      );


    travelEmbed.setFooter({
      text: `QuestCord • Landing in ${Math.round(timeSec / 60)} minutes`,
      iconURL: interaction.client.user.displayAvatarURL()
    }).setTimestamp();

    if (base) {
      travelEmbed.addFields({
        name: '🌐 Live Updates',
        value: `[🎮 Visit Website](${base})`,
        inline: false
      });
    }

    await interaction.reply({ embeds: [travelEmbed] });
  },

  async handleServerTravel(interaction, userPrefix, target) {
    const servers = db.prepare(`
      SELECT * FROM servers
      WHERE archived=0 AND (name LIKE ? OR guildId=?)
      AND lat IS NOT NULL AND lon IS NOT NULL
      GROUP BY guildId
      ORDER BY addedAt DESC
      LIMIT 1
    `).all(`%${target}%`, target);
    if (!servers.length) {
      return interaction.reply({ content: `${userPrefix} No matching active server with coordinates.`, ephemeral: true });
    }
    const dest = servers[0];
    let p = await ensurePlayerWithVehicles(interaction.client, interaction.user.id, interaction.user.username, interaction.guild?.id);
    let fromServer = db.prepare('SELECT * FROM servers WHERE guildId=? AND archived=0 ORDER BY addedAt DESC LIMIT 1').get(p.locationGuildId || interaction.guild?.id);
    if (!fromServer || fromServer.lat == null) {
      fromServer = db.prepare('SELECT * FROM servers WHERE guildId=? AND archived=0 ORDER BY addedAt DESC LIMIT 1').get(interaction.guild?.id);
    }
    const tcfg = config.travel || {};
    const minS = tcfg.minSeconds ?? 60;
    const maxS = tcfg.maxSeconds ?? 600;
    const distMult = tcfg.distanceMultiplier ?? 0.2;


    let timeSec = minS;
    if (fromServer && fromServer.lat != null) {
      const d = haversine(fromServer.lat, fromServer.lon, dest.lat, dest.lon);
      const mult = await vehicleSpeed(interaction.client, interaction.user.id);
      let base = minS + (d * distMult) / mult;
      
      
      const staminaRow = db.prepare('SELECT stamina FROM players WHERE userId=?').get(interaction.user.id);
      const stamina = staminaRow?.stamina || 0;
      const maxReduction = (config.stamina?.travelMaxReductionPct ?? 50) / 100;
      const staminaFactor = 1 - Math.min(maxReduction, stamina / 200);
      timeSec = Math.round(base * staminaFactor);
      if (timeSec < minS) timeSec = minS;
      if (timeSec > maxS) timeSec = maxS;
      const spend = config.stamina?.travelCost ?? 10;
      const newSt = Math.max(0, stamina - spend);
      db.prepare('UPDATE players SET stamina=?, staminaUpdatedAt=? WHERE userId=?').run(newSt, Date.now(), interaction.user.id);
    }
    const arrival = Date.now() + timeSec * 1000;
    db.prepare('UPDATE players SET travelArrivalAt=?, travelStartAt=?, locationGuildId=?, travelFromGuildId=? WHERE userId=?').run(arrival, Date.now(), dest.guildId, fromServer ? fromServer.guildId : null, interaction.user.id);

    // Record travel activity for real-time statistics
    try {
      const realtimeStats = require('../web/routes/realtime-stats');
      if (realtimeStats && realtimeStats.recordTravel) {
        realtimeStats.recordTravel(interaction.user.id, fromServer ? fromServer.guildId : null, dest.guildId);
      }
    } catch (statsError) {
      // Don't let stats tracking errors affect travel execution
      console.warn('Failed to record travel activity:', statsError.message);
    }
    const base = (config.web && config.web.publicBaseUrl || '').replace(/\/$/, '');
    const isPremiumUser = await isPremium(interaction.client, interaction.user.id);
    const speedMult = await vehicleSpeed(interaction.client, interaction.user.id);
    
    // Calculate distance
    const distance = fromServer && fromServer.lat != null ? 
      haversine(fromServer.lat, fromServer.lon, dest.lat, dest.lon) : 0;
    
    // Get stamina info
    const staminaRow = db.prepare('SELECT stamina FROM players WHERE userId=?').get(interaction.user.id);
    const currentStamina = staminaRow?.stamina || 0;
    const staminaCost = config.stamina?.travelCost ?? 10;
    
    const travelEmbed = new EmbedBuilder()
      .setTitle(`🌍 Journey to ${dest.name}`)
      .setDescription(`${userPrefix} Embarking on an adventure to a new Discord server`)
      .setColor(isPremiumUser ? 0xFFD700 : 0x5865F2)
      .setAuthor({
        name: `${interaction.user.displayName} - Adventurer`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .addFields(
        {
          name: '✈️ Vehicle Type',
          value: `**${isPremiumUser ? 'Private Jet 🚁' : 'Commercial Flight ✈️'}**\n${isPremiumUser ? 'Premium travel experience' : 'Standard transportation'}`,
          inline: true
        },
        {
          name: '🎯 Destination Server',
          value: `**${dest.name}**`,
          inline: true
        },
        {
          name: '⏱️ Travel Duration',
          value: `**${Math.floor(timeSec/60)}m ${timeSec%60}s**\nETA: <t:${Math.floor(arrival / 1000)}:t>`,
          inline: true
        }
      );

    if (distance > 0) {
      travelEmbed.addFields({
        name: '🗺️ Distance',
        value: `**${distance.toFixed(1)} km**`,
        inline: true
      });
    }

    if (fromServer) {
      travelEmbed.addFields({
        name: '📍 Departure Point',
        value: `**${fromServer.name || fromServer.guildId}**`,
        inline: true
      });
    }

    travelEmbed.addFields({
      name: '🕰️ Arrival Time',
      value: `<t:${Math.floor(arrival / 1000)}:t>\n<t:${Math.floor(arrival / 1000)}:R>`,
      inline: true
    });

    travelEmbed.addFields({
      name: '⚡ Energy Usage',
      value: `**${staminaCost}** stamina used\n**${Math.max(0, currentStamina - staminaCost)}** remaining`,
      inline: true
    });

    if (isPremiumUser) {
      travelEmbed.addFields({
        name: '🌟 Premium Perks',
        value: `• **${speedMult}x** faster travel speed\n• Luxury accommodations\n• Priority boarding`,
        inline: false
      });
    }

    if (base) {
      travelEmbed.addFields({
        name: '🌐 Live Updates',
        value: `[🎮 Visit Website](${base})`,
        inline: false
      });
    }

    }

    travelEmbed
      .setFooter({
        text: `QuestCord • Safe travels and new discoveries await!`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    logger.info('travel_start: user %s to %s from %s (speed: %sx)', interaction.user.id, dest.guildId, fromServer?.guildId, speedMult);
    await interaction.reply({ embeds: [travelEmbed] });
  }
};
