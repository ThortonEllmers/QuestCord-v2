const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { getUserPrefix, isStaffOrDev } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');
const { isBanned } = require('./_guard');
const { haversine } = require('../utils/geo');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('teleport')
    .setDescription('⚡ Instantly teleport to any server (Staff/Developer only)')
    .addStringOption(o =>
      o.setName('serverid')
        .setDescription('🎯 Target server ID (use autocomplete)')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    try {
      // Get current input
      const focusedValue = interaction.options.getFocused().toLowerCase();

      // Search servers by ID or name
      const servers = db.prepare(`
        SELECT guildId, name, biome FROM servers
        WHERE archived = 0
        AND (guildId LIKE ? OR name LIKE ?)
        AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY name
        LIMIT 25
      `).all(`%${focusedValue}%`, `%${focusedValue}%`);

      const choices = servers.map(s => ({
        name: `${s.name || 'Unknown'} ${s.biome ? `[${s.biome}]` : ''} (${s.guildId})`,
        value: s.guildId
      }));

      await interaction.respond(choices);
    } catch (error) {
      console.error('Teleport autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'teleport', interaction.guild?.id);

    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    // Check ban status
    if (isBanned(interaction.user.id)) {
      return interaction.reply({
        content: `${userPrefix} ❌ You are banned from using this bot.`,
        ephemeral: true
      });
    }

    const targetServerId = interaction.options.getString('serverid');
    const userId = interaction.user.id;

    // Check if user has permission (Staff or Developer role)
    if (!(await isStaffOrDev(interaction.client, userId))) {
      return interaction.reply({
        content: `${userPrefix} ❌ This command is only available to Staff and Developers.`,
        ephemeral: true
      });
    }

    try {
      // Check if target server exists and has coordinates
      const targetServer = db.prepare(`
        SELECT guildId, name, lat, lon, biome
        FROM servers
        WHERE guildId = ? AND archived = 0
        AND lat IS NOT NULL AND lon IS NOT NULL
      `).get(targetServerId);

      if (!targetServer) {
        const embed = new EmbedBuilder()
          .setTitle('❌📍 **SERVER NOT FOUND** 📍❌')
          .setDescription('🔍 *Target server is not available for teleportation*')
          .setColor(0xE74C3C)
          .setAuthor({
            name: `${userPrefix} - Teleport Error`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .addFields(
            {
              name: '🎯 **Target Server ID**',
              value: `\`${targetServerId}\``,
              inline: true
            },
            {
              name: '❌ **Possible Issues**',
              value: '• Server not in network\n• No coordinates set\n• Server archived\n• Invalid server ID',
              inline: true
            },
            {
              name: '💡 **Solution**',
              value: 'Use autocomplete to find valid servers',
              inline: true
            }
          )
          .setFooter({
            text: '🛡️ Staff Tools • QuestCord Teleportation',
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Get or create player record
      let player = db.prepare('SELECT * FROM players WHERE userId = ?').get(userId);
      if (!player) {
        db.prepare('INSERT INTO players(userId, name, locationGuildId) VALUES(?, ?, ?)')
          .run(userId, interaction.user.username, interaction.guild.id);
        player = db.prepare('SELECT * FROM players WHERE userId = ?').get(userId);
      }

      // Get current location for logging and distance calculation
      const currentServer = db.prepare('SELECT guildId, name, lat, lon, biome FROM servers WHERE guildId = ?')
        .get(player.locationGuildId);

      // Check if already at target location
      if (player.locationGuildId === targetServerId) {
        const embed = new EmbedBuilder()
          .setTitle('📍✅ **ALREADY AT DESTINATION** ✅📍')
          .setDescription('🎯 *You are already at this server location*')
          .setColor(0x95A5A6)
          .setAuthor({
            name: `${userPrefix} - Current Location`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .addFields({
            name: '🏛️ **Current Server**',
            value: `**${targetServer.name}**\n🌿 ${targetServer.biome || 'Unknown Biome'}\n🆔 \`${targetServerId}\``,
            inline: false
          })
          .setFooter({
            text: '📍 No teleportation needed • QuestCord',
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Calculate distance saved for statistics
      let distanceSaved = 0;
      if (currentServer && currentServer.lat && currentServer.lon) {
        distanceSaved = haversine(
          currentServer.lat, currentServer.lon,
          targetServer.lat, targetServer.lon
        );
      }

      // Get role level for logging
      const adminRole = await fetchRoleLevel(interaction.user.id);

      // Instant teleport - set location directly and mark arrival as complete
      const now = Date.now();
      db.prepare(`
        UPDATE players
        SET locationGuildId = ?,
            travelArrivalAt = 0,
            travelStartAt = NULL,
            travelFromGuildId = NULL
        WHERE userId = ?
      `).run(targetServerId, userId);

      // Log the teleport action
      logger.info('teleport: staff user %s teleported from %s to %s (%s)',
        userId,
        currentServer?.name || 'unknown',
        targetServer.name,
        targetServerId
      );

      const config = require('../utils/config');
      const baseUrl = (config.web?.publicBaseUrl || '').replace(/\/$/, '');

      const embed = new EmbedBuilder()
        .setTitle('⚡✨ **TELEPORTATION COMPLETE** ✨⚡')
        .setDescription('🌟 *Instant transportation successful - Welcome to your destination!* 🎯')
        .setColor(0x9B59B6)
        .setAuthor({
          name: `${userPrefix} - Teleportation Master`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '📍 **Origin**',
            value: currentServer ?
              `**${currentServer.name}**\n🌿 ${currentServer.biome || 'Unknown'}\n🆔 \`${currentServer.guildId}\`` :
              '**Unknown Location**\nNo origin data',
            inline: true
          },
          {
            name: '🎯 **Destination**',
            value: `**${targetServer.name}**\n🌿 ${targetServer.biome || 'Unknown Biome'}\n🆔 \`${targetServerId}\``,
            inline: true
          },
          {
            name: '📊 **Teleport Stats**',
            value: distanceSaved > 0 ?
              `**Distance:** ${distanceSaved.toFixed(1)}km\n**Time Saved:** Instant\n**Method:** Staff Override` :
              '**Distance:** Unknown\n**Time Saved:** Instant\n**Method:** Staff Override',
            inline: true
          }
        );

      if (baseUrl) {
        embed.addFields({
          name: '🌐 **Location Link**',
          value: `[📍 View Server](${baseUrl}/${targetServerId})`,
          inline: false
        });
      }

      embed.addFields(
        {
          name: '🛡️ **Administrative Details**',
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Instant Teleport`,
          inline: true
        },
        {
          name: '⏰ **Teleport Time**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      embed.setFooter({
        text: '🛡️ Staff Privilege Used • QuestCord Teleportation System',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Teleport command error:', error);

      const embed = new EmbedBuilder()
        .setTitle('❌⚡ **TELEPORTATION FAILED** ⚡❌')
        .setDescription('🔴 *An error occurred during the teleportation process*')
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Teleport Error`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '🎯 **Target Server**',
            value: `\`${targetServerId}\``,
            inline: true
          },
          {
            name: '❌ **Error Status**',
            value: 'System error occurred',
            inline: true
          },
          {
            name: '🔧 **Next Steps**',
            value: '• Try again in a moment\n• Check server ID validity\n• Contact development team',
            inline: true
          }
        )
        .setFooter({
          text: '🛡️ Error logged for investigation • QuestCord',
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};