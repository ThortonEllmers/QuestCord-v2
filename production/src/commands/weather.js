const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { getUserPrefix } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Weather system management for staff and developers')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a weather event at specific coordinates')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Weather event type')
            .setRequired(true)
            .addChoices(
              // Catastrophic (Severity 5)
              { name: '🌪️ Superstorm Genesis (Blocks travel)', value: 'superstorm' },
              { name: '🌀 Hypercane (Blocks travel)', value: 'category_6_hurricane' },
              { name: '🧊 Ice Apocalypse (Blocks travel)', value: 'ice_apocalypse' },
              
              // Severe (Severity 4) 
              { name: '💥 Cyclonic Bomb (Blocks travel)', value: 'cyclonic_bomb' },
              { name: '🌋 Pyroclastic Flow (Blocks travel)', value: 'pyroclastic_surge' },
              { name: '💨 Derecho Windstorm (Blocks travel)', value: 'derecho_windstorm' },
              
              // Dangerous (Severity 3)
              { name: '🌪️ Supercell Complex (Slows travel)', value: 'supercell_outbreak' },
              { name: '🌊 Atmospheric River (Slows travel)', value: 'atmospheric_river' },
              { name: '🏜️ Haboob Dust Wall (Slows travel)', value: 'haboob_dust_wall' },
              { name: '🥶 Polar Vortex (Slows travel)', value: 'polar_vortex' },
              
              // Moderate (Severity 2)
              { name: '〰️ Gravity Wave Storm (Slows travel)', value: 'gravity_wave_storm' },
              { name: '🌡️ Thermal Inversion (Slows travel)', value: 'temperature_inversion' },
              { name: '⬇️ Microburst Cluster (Slows travel)', value: 'microbursts_cluster' },
              { name: '🧊 Ice Pellet Storm (Slows travel)', value: 'ice_pellet_storm' },

              // Mild (Severity 1)
              { name: '🌫️ Marine Layer Fog (Minor delays)', value: 'sea_fog_bank' },
              { name: '🏔️ Mountain Wave (Minor delays)', value: 'mountain_wave_turbulence' },
              { name: '✨ Aurora Substorm (Helps navigation)', value: 'aurora_substorm' },
              { name: '👻 Sprite Lightning Event (Minimal impact)', value: 'sprite_lightning_storm' }
            )
        )
        .addNumberOption(option =>
          option
            .setName('latitude')
            .setDescription('Latitude coordinate (-90 to 90)')
            .setRequired(true)
            .setMinValue(-90)
            .setMaxValue(90)
        )
        .addNumberOption(option =>
          option
            .setName('longitude')
            .setDescription('Longitude coordinate (-180 to 180)')
            .setRequired(true)
            .setMinValue(-180)
            .setMaxValue(180)
        )
        .addIntegerOption(option =>
          option
            .setName('duration')
            .setDescription('Duration in minutes (10-1440, default: 60)')
            .setMinValue(10)
            .setMaxValue(1440)
        )
        .addIntegerOption(option =>
          option
            .setName('radius')
            .setDescription('Radius in kilometers (25-500, default: varies by type)')
            .setMinValue(25)
            .setMaxValue(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all active weather events')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a specific weather event')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('Weather event ID to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear all active weather events')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('country')
        .setDescription('Create weather event in a specific country/region')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Weather event type')
            .setRequired(true)
            .addChoices(
              { name: '🌪️ Superstorm Genesis', value: 'superstorm' },
              { name: '🌀 Hypercane', value: 'category_6_hurricane' },
              { name: '🧊 Ice Apocalypse', value: 'ice_apocalypse' },
              { name: '💥 Cyclonic Bomb', value: 'cyclonic_bomb' },
              { name: '🌋 Pyroclastic Flow', value: 'pyroclastic_surge' },
              { name: '💨 Derecho Windstorm', value: 'derecho_windstorm' },
              { name: '🌪️ Supercell Complex', value: 'supercell_outbreak' },
              { name: '🌊 Atmospheric River', value: 'atmospheric_river' }
            )
        )
        .addStringOption(option =>
          option
            .setName('country')
            .setDescription('Country or region name')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    const subcommand = interaction.options.getSubcommand();

    // Log command usage for live activity tracking (include subcommand)
    logCommand(interaction.user.id, `weather ${subcommand}`, interaction.guild?.id);

    // Check if user has staff or developer permissions (only for admin commands)
    if (subcommand !== 'list') {
      const roleLevel = await fetchRoleLevel(interaction.user.id);
      if (!['Developer', 'Staff'].includes(roleLevel)) { // Require staff level or higher
        return interaction.reply({
          content: `${userPrefix} This command requires staff permissions.`,
          ephemeral: true
        });
      }
    }

    const {
      createWeatherEvent,
      removeWeatherEvent,
      clearAllWeatherEvents,
      createWeatherInCountry,
      WEATHER_TYPES
    } = require('../utils/weather');

    try {
      switch (subcommand) {
        case 'create': {
          const type = interaction.options.getString('type');
          const lat = interaction.options.getNumber('latitude');
          const lon = interaction.options.getNumber('longitude');
          const duration = interaction.options.getInteger('duration') || 60;
          const customRadius = interaction.options.getInteger('radius');

          const weatherEvent = await createWeatherEvent(type, lat, lon, duration, customRadius, interaction.client);
          
          if (!weatherEvent) {
            return interaction.reply({ 
              content: `${userPrefix} Failed to create weather event.`, 
              ephemeral: true 
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('🌦️ **WEATHER EVENT CREATED** 🌦️')
            .setDescription(`Successfully spawned a **${weatherEvent.name}** weather event!`)
            .setColor(weatherEvent.color || 0x3498db)
            .addFields(
              {
                name: '🌪️ **Event Type**',
                value: `${weatherEvent.icon} **${weatherEvent.name}**\nSeverity: ${weatherEvent.severity}/5`,
                inline: true
              },
              {
                name: '📍 **Location**',
                value: `**Lat:** ${lat}°\n**Lon:** ${lon}°`,
                inline: true
              },
              {
                name: '📏 **Coverage**',
                value: `**Radius:** ${weatherEvent.radius}km\n**Area:** ${Math.round(Math.PI * weatherEvent.radius * weatherEvent.radius)} km²`,
                inline: true
              },
              {
                name: '⏰ **Duration**',
                value: `**${duration} minutes**\nExpires: <t:${Math.floor(weatherEvent.endTime/1000)}:R>`,
                inline: true
              },
              {
                name: '✈️ **Travel Impact**',
                value: weatherEvent.blockTravel ? '🚫 **Blocks Travel**' : '⚠️ **Slows Travel**',
                inline: true
              },
              {
                name: '🆔 **Event ID**',
                value: `\`${weatherEvent.id}\`\nUse for removal`,
                inline: true
              }
            )
            .setFooter({ 
              text: `Created by ${interaction.user.username} • QuestCord Weather System`,
              iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'country': {
          const type = interaction.options.getString('type');
          const country = interaction.options.getString('country');

          const result = await createWeatherInCountry(type, country, interaction.client);
          
          if (!result.success) {
            return interaction.reply({ 
              content: `${userPrefix} ${result.message}`, 
              ephemeral: true 
            });
          }

          const weatherEvent = result.weatherEvent;
          const embed = new EmbedBuilder()
            .setTitle('🌍 **REGIONAL WEATHER EVENT CREATED** 🌍')
            .setDescription(`Successfully spawned a **${weatherEvent.name}** in **${country}**!`)
            .setColor(weatherEvent.color || 0x3498db)
            .addFields(
              {
                name: '🌪️ **Event Type**',
                value: `${weatherEvent.icon} **${weatherEvent.name}**\nSeverity: ${weatherEvent.severity}/5`,
                inline: true
              },
              {
                name: '🗺️ **Region**',
                value: `**${country}**\n📍 ${result.coordinates.lat.toFixed(2)}°, ${result.coordinates.lon.toFixed(2)}°`,
                inline: true
              },
              {
                name: '📏 **Coverage**',
                value: `**Radius:** ${weatherEvent.radius}km\n**Area:** ${Math.round(Math.PI * weatherEvent.radius * weatherEvent.radius)} km²`,
                inline: true
              }
            )
            .setFooter({ 
              text: `Created by ${interaction.user.username} • QuestCord Weather System`,
              iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'list': {
          const activeWeather = db.prepare('SELECT * FROM weather_events WHERE endTime > ? ORDER BY created_at DESC')
            .all(Date.now());

          if (activeWeather.length === 0) {
            return interaction.reply({ 
              content: `${userPrefix} No active weather events.`, 
              ephemeral: true 
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('🌦️ **ACTIVE WEATHER EVENTS** 🌦️')
            .setDescription(`Currently tracking **${activeWeather.length}** weather events`)
            .setColor(0x3498db);

          // Group events by type for better display
          const eventsByType = {};
          activeWeather.forEach(event => {
            if (!eventsByType[event.type]) eventsByType[event.type] = [];
            eventsByType[event.type].push(event);
          });

          let fieldCount = 0;
          for (const [type, events] of Object.entries(eventsByType)) {
            if (fieldCount >= 25) break; // Discord embed field limit

            // Get weather type info from WEATHER_TYPES
            const weatherType = WEATHER_TYPES[type];
            const displayName = weatherType ? weatherType.name : type.toUpperCase().replace(/_/g, ' ');
            const icon = weatherType ? weatherType.icon : '🌦️';

            const eventList = events.map(event => {
              const timeLeft = Math.round((event.endTime - Date.now()) / 1000 / 60);
              return `\`${event.id}\` - ${event.centerLat.toFixed(1)}°, ${event.centerLon.toFixed(1)}° (${timeLeft}m left)`;
            }).join('\n');

            embed.addFields({
              name: `${icon} **${displayName}** (${events.length})`,
              value: eventList.substring(0, 1024), // Discord field value limit
              inline: false
            });
            fieldCount++;
          }

          embed.setFooter({ 
            text: 'Use /weather remove <id> to remove specific events • QuestCord Weather',
            iconURL: interaction.client.user.displayAvatarURL()
          });

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'remove': {
          const eventId = interaction.options.getString('id');
          const success = removeWeatherEvent(eventId);

          if (success) {
            await interaction.reply({ 
              content: `${userPrefix} ✅ Weather event \`${eventId}\` removed successfully.`
            });
          } else {
            await interaction.reply({ 
              content: `${userPrefix} ❌ Weather event \`${eventId}\` not found or already expired.`, 
              ephemeral: true 
            });
          }
          break;
        }

        case 'clear': {
          const clearedCount = clearAllWeatherEvents();
          
          await interaction.reply({ 
            content: `${userPrefix} ✅ Cleared **${clearedCount}** active weather events.`
          });
          break;
        }

        default:
          await interaction.reply({ 
            content: `${userPrefix} Unknown subcommand.`, 
            ephemeral: true 
          });
      }
    } catch (error) {
      console.error('[weather command] Error:', error);
      await interaction.reply({ 
        content: `${userPrefix} Error executing weather command: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
};