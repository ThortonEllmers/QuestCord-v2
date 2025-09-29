const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const { db, logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('waypoints')
    .setDescription('Manage your saved waypoints')
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('View all your saved waypoints'))
    .addSubcommand(sc => sc
      .setName('save')
      .setDescription('Save your current location as a waypoint')
      .addStringOption(o => o
        .setName('name')
        .setDescription('Name for this waypoint (e.g. "Home Base", "Boss Arena")')
        .setRequired(true)))
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('Remove a waypoint')
      .addStringOption(o => o
        .setName('name')
        .setDescription('Name of waypoint to remove')
        .setRequired(true)))
    .addSubcommand(sc => sc
      .setName('travel')
      .setDescription('Travel to a saved waypoint')
      .addStringOption(o => o
        .setName('name')
        .setDescription('Name of waypoint to travel to')
        .setRequired(true))),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    regenStamina(interaction.user.id);

    const subcommand = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `waypoints ${subcommand}`, interaction.guild?.id);
    const userId = interaction.user.id;

    if (subcommand === 'list') {
      const waypoints = db.prepare(`
        SELECT name, guildId, serverName, createdAt
        FROM waypoints
        WHERE userId = ?
        ORDER BY createdAt DESC
      `).all(userId);

      const listEmbed = new EmbedBuilder()
        .setTitle('🗺️📍 **SAVED WAYPOINTS** 📍🗺️')
        .setDescription('✨ *Your personal collection of memorable locations* ⚡')
        .setColor(0x3498DB)
        .setAuthor({ 
          name: `${userPrefix} - Navigator`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      if (waypoints.length === 0) {
        listEmbed.addFields({
          name: '📭 **No Waypoints Saved**',
          value: '• Use `/waypoints save <name>` to save your current location\n• Great for marking favorite servers, boss locations, or meeting spots\n• You can save up to 20 waypoints total',
          inline: false
        });
      } else {
        // Group waypoints by server for better organization
        const waypointsByServer = {};
        waypoints.forEach(wp => {
          const serverName = wp.serverName || wp.guildId;
          if (!waypointsByServer[serverName]) {
            waypointsByServer[serverName] = [];
          }
          waypointsByServer[serverName].push(wp);
        });

        listEmbed.addFields({
          name: '📊 **Waypoint Summary**',
          value: `🗺️ **${waypoints.length}/20** waypoints saved\n🏛️ **${Object.keys(waypointsByServer).length}** unique servers\n⚡ Use \`/waypoints travel <name>\` to visit`,
          inline: false
        });

        // Display waypoints grouped by server
        Object.entries(waypointsByServer).slice(0, 8).forEach(([serverName, serverWaypoints]) => {
          const waypointList = serverWaypoints.map(wp => {
            const age = Math.floor((Date.now() - wp.createdAt) / (1000 * 60 * 60 * 24));
            return `📍 **${wp.name}** (${age} days ago)`;
          }).join('\n');

          listEmbed.addFields({
            name: `🏛️ **${serverName}**`,
            value: waypointList,
            inline: true
          });
        });

        if (Object.keys(waypointsByServer).length > 8) {
          listEmbed.addFields({
            name: '📋 **More Locations**',
            value: `... and ${Object.keys(waypointsByServer).length - 8} more servers with waypoints`,
            inline: false
          });
        }
      }

      listEmbed.addFields({
        name: '💡 **Pro Tips**',
        value: '• **Quick Travel**: Use waypoints for instant access to favorite locations\n• **Boss Hunting**: Save servers with frequent boss spawns\n• **Social Hubs**: Mark servers with active communities\n• **Strategic Locations**: Bookmark servers for trading or events',
        inline: false
      });

      listEmbed.setFooter({ 
        text: `🧭 Navigate the world with ease • QuestCord Waypoints`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [listEmbed] });
    }

    if (subcommand === 'save') {
      const name = interaction.options.getString('name');
      const player = db.prepare('SELECT locationGuildId FROM players WHERE userId = ?').get(userId);
      const currentLocation = player?.locationGuildId || interaction.guild.id;
      
      // Check waypoint limit
      const currentWaypoints = db.prepare('SELECT COUNT(*) as count FROM waypoints WHERE userId = ?').get(userId);
      if (currentWaypoints.count >= 20) {
        const limitEmbed = new EmbedBuilder()
          .setTitle('❌📍 **WAYPOINT LIMIT REACHED** 📍❌')
          .setDescription('You have reached the maximum of 20 saved waypoints')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix} - Storage Full`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '📊 **Current Status**',
              value: `**20/20** waypoints used\nStorage at maximum capacity`,
              inline: true
            },
            {
              name: '🗑️ **Free Up Space**',
              value: 'Use `/waypoints remove <name>` to delete old waypoints first',
              inline: true
            },
            {
              name: '💡 **Management Tips**',
              value: '• Remove waypoints you no longer visit\n• Keep only your most important locations\n• Regular cleanup helps maintain organization',
              inline: false
            }
          )
          .setFooter({ 
            text: `🧹 Clean up old waypoints to make room for new ones • QuestCord`,
            iconURL: interaction.client.user.displayAvatarURL()
          });
        
        return interaction.reply({ embeds: [limitEmbed], ephemeral: true });
      }

      // Get server info
      const server = db.prepare('SELECT name FROM servers WHERE guildId = ?').get(currentLocation);
      const serverName = server?.name || interaction.guild?.name || currentLocation;

      // Check if name already exists
      const existing = db.prepare('SELECT id FROM waypoints WHERE userId = ? AND name = ?').get(userId, name);
      if (existing) {
        return interaction.reply({ 
          content: `${userPrefix} You already have a waypoint named **${name}**. Choose a different name or remove the existing one first.`, 
          ephemeral: true 
        });
      }

      // Save waypoint
      try {
        db.prepare(`
          INSERT INTO waypoints (userId, name, guildId, serverName, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(userId, name, currentLocation, serverName, Date.now());

        const saveEmbed = new EmbedBuilder()
          .setTitle('✅📍 **WAYPOINT SAVED** 📍✅')
          .setDescription('✨ *Location bookmarked for future travel* ✨')
          .setColor(0x00D26A)
          .setAuthor({ 
            name: `${userPrefix} - Location Saved`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '📍 **Waypoint Name**',
              value: `**${name}**\n🏷️ Your custom label`,
              inline: true
            },
            {
              name: '🏛️ **Server**',
              value: `**${serverName}**\n🆔 ${currentLocation}`,
              inline: true
            },
            {
              name: '📊 **Storage**',
              value: `**${currentWaypoints.count + 1}/20** waypoints\n${20 - currentWaypoints.count - 1} slots remaining`,
              inline: true
            },
            {
              name: '🚀 **Quick Access**',
              value: `• Use \`/waypoints travel ${name}\` to return here\n• View all waypoints with \`/waypoints list\`\n• Perfect for marking favorite locations!`,
              inline: false
            }
          )
          .setFooter({ 
            text: `🗺️ Waypoint ready for instant travel • QuestCord Navigation`,
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [saveEmbed] });
      } catch (error) {
        return interaction.reply({ 
          content: `${userPrefix} Error saving waypoint. Please try again.`, 
          ephemeral: true 
        });
      }
    }

    if (subcommand === 'remove') {
      const name = interaction.options.getString('name');
      
      const waypoint = db.prepare('SELECT * FROM waypoints WHERE userId = ? AND name = ?').get(userId, name);
      if (!waypoint) {
        return interaction.reply({ 
          content: `${userPrefix} Waypoint **${name}** not found. Use \`/waypoints list\` to see your saved waypoints.`, 
          ephemeral: true 
        });
      }

      db.prepare('DELETE FROM waypoints WHERE userId = ? AND name = ?').run(userId, name);

      const removeEmbed = new EmbedBuilder()
        .setTitle('🗑️📍 **WAYPOINT REMOVED** 📍🗑️')
        .setDescription('The waypoint has been deleted from your saved locations')
        .setColor(0xFF8C00)
        .setAuthor({ 
          name: `${userPrefix} - Waypoint Manager`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '🗑️ **Removed Waypoint**',
            value: `**${name}**\nFrom ${waypoint.serverName || waypoint.guildId}`,
            inline: true
          },
          {
            name: '📊 **Storage**',
            value: `Freed up 1 waypoint slot\nReady for new locations`,
            inline: true
          },
          {
            name: '💡 **Next Steps**',
            value: '• Save new waypoints with `/waypoints save`\n• View remaining waypoints with `/waypoints list`',
            inline: true
          }
        )
        .setFooter({ 
          text: `🧹 Waypoint cleanup complete • QuestCord Management`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      return interaction.reply({ embeds: [removeEmbed] });
    }

    if (subcommand === 'travel') {
      const name = interaction.options.getString('name');
      
      const waypoint = db.prepare('SELECT * FROM waypoints WHERE userId = ? AND name = ?').get(userId, name);
      if (!waypoint) {
        return interaction.reply({ 
          content: `${userPrefix} Waypoint **${name}** not found. Use \`/waypoints list\` to see your saved waypoints.`, 
          ephemeral: true 
        });
      }

      // Check if server still exists
      const server = db.prepare('SELECT * FROM servers WHERE guildId = ? AND archived = 0').get(waypoint.guildId);
      if (!server) {
        const unavailableEmbed = new EmbedBuilder()
          .setTitle('❌🏛️ **SERVER UNAVAILABLE** 🏛️❌')
          .setDescription('The server for this waypoint is no longer accessible')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix} - Travel Error`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '📍 **Waypoint**',
              value: `**${name}**\nTarget server unavailable`,
              inline: true
            },
            {
              name: '🏛️ **Server Status**',
              value: 'Server may be:\n• Archived or removed\n• Temporarily offline\n• No longer in the network',
              inline: true
            },
            {
              name: '🧹 **Recommendation**',
              value: `Consider removing this waypoint:\n\`/waypoints remove ${name}\``,
              inline: true
            }
          )
          .setFooter({ 
            text: `🛠️ Clean up outdated waypoints regularly • QuestCord`,
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [unavailableEmbed], ephemeral: true });
      }

      // Use the regular travel system
      // We'll integrate with the existing travel command by redirecting
      return interaction.reply({
        content: `${userPrefix} **Waypoint Travel:** Use \`/travel ${server.name || waypoint.guildId}\` to travel to your **${name}** waypoint!\n\n💡 *Waypoint quick-travel will be available in a future update.*`,
        ephemeral: true
      });
    }
  }
};