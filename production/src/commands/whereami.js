const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix } = require('../utils/roles');
const { logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whereami')
    .setDescription('Show your current virtual location (server name and ID).'),

  async execute(interaction) {
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'whereami', interaction.guild?.id);
    const { db } = require('../utils/store_sqlite');
    const userId = interaction.user.id;

    const player = db.prepare(`
      SELECT locationGuildId, travelArrivalAt, travelFromGuildId, travelStartAt
      FROM players
      WHERE userId=?`).get(userId) || {};

    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    if (player.travelArrivalAt && player.travelArrivalAt > Date.now()) {
      const fromServer = db.prepare('SELECT name FROM servers WHERE guildId=?').get(player.travelFromGuildId);
      const toServer = db.prepare('SELECT name FROM servers WHERE guildId=?').get(player.locationGuildId);
      
      const fromName = fromServer?.name || `Server (${player.travelFromGuildId})`;
      const toName = toServer?.name || `Server (${player.locationGuildId})`;
      
      const timeLeft = Math.ceil((player.travelArrivalAt - Date.now()) / 1000 / 60); // minutes
      const arrivalTime = new Date(player.travelArrivalAt);
      
      const travelEmbed = new EmbedBuilder()
        .setTitle('✈️ Travel in Progress')
        .setDescription(`${userPrefix} You are currently traveling between servers`)
        .setColor(0x5865F2)
        .setAuthor({
          name: interaction.user.displayName,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '📍 Departure',
            value: `**${fromName}**`,
            inline: true
          },
          {
            name: '🎯 Destination',
            value: `**${toName}**`,
            inline: true
          },
          {
            name: '⏰ Time Remaining',
            value: `**${timeLeft} minutes**\nArrival: <t:${Math.floor(arrivalTime.getTime() / 1000)}:t>`,
            inline: true
          },
          {
            name: '💡 While Traveling',
            value: '• Check your `/inventory`\n• Browse the `/market`\n• View your `/achievements`',
            inline: false
          }
        )
        .setFooter({
          text: 'QuestCord • Travel will complete automatically',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      
      await interaction.reply({ embeds: [travelEmbed] });
    } else {
      // User is at a location
      const destinationGuildId = player.locationGuildId || config.spawn?.guildId || interaction.guildId;
      
      // Get server name from DB
      let serverName = null;
      let serverData = null;
      if (destinationGuildId) {
        serverData = db.prepare('SELECT name, biome FROM servers WHERE guildId=?').get(destinationGuildId);
        serverName = serverData?.name || null;

        if (!serverName) {
          const g = interaction.client.guilds.cache.get(destinationGuildId);
          if (g?.name) {
            serverName = g.name;
            // Keep DB fresh
            db.prepare(`
              INSERT INTO servers (guildId, name)
              VALUES (?, ?)
              ON CONFLICT(guildId) DO UPDATE SET name=excluded.name`)
              .run(destinationGuildId, serverName);
          }
        }
      }

      const displayName = serverName || `Server (${destinationGuildId})`;
      const biome = serverData?.biome || 'Unknown Biome';
      
      // Get region info from guild location if available, or use a default
      const region = interaction.guild?.preferredLocale ? 
        interaction.guild.preferredLocale.split('-')[1]?.toUpperCase() || 'Unknown Region' : 
        'Unknown Region';
      
      const locationEmbed = new EmbedBuilder()
        .setTitle(`🏛️ ${userPrefix} Current Location`)
        .setDescription('Your present location and local environment details')
        .setColor(0x5865F2)
        .setAuthor({
          name: interaction.user.displayName,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '🌍 Server',
            value: `**${displayName}**`,
            inline: true
          },
          {
            name: '📍 Region',
            value: `**${region}**`,
            inline: true
          },
          {
            name: '🌿 Biome',
            value: `**${biome}**`,
            inline: true
          },
          {
            name: '🚀 Travel Options',
            value: '• `/travel` - Visit other servers\n• `/nearby` - View nearby destinations\n• `/waypoints` - Quick travel locations',
            inline: false
          }
        )
        .setFooter({
          text: 'QuestCord • Explore the world of Discord servers',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      
      await interaction.reply({ embeds: [locationEmbed] });
    }
  },
};
