const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const { getTravelHistory, getTravelStats } = require('../utils/travel_history');
const { logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your travel history and statistics')
    .addSubcommand(sc => sc
      .setName('travels')
      .setDescription('View your recent travel history'))
    .addSubcommand(sc => sc
      .setName('stats')
      .setDescription('View detailed travel statistics')),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    regenStamina(interaction.user.id);

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `history ${subcommand}`, interaction.guild?.id);

    if (subcommand === 'travels') {
      const history = getTravelHistory(userId, 15);

      const historyEmbed = new EmbedBuilder()
        .setTitle('🌍📜 **TRAVEL HISTORY** 📜🌍')
        .setDescription('✨ *Your journey across the server network* ✨')
        .setColor(0x3498DB)
        .setAuthor({ 
          name: `${userPrefix} - Travel Journal`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      if (history.length === 0) {
        historyEmbed.addFields({
          name: '📭 **No Travel Records**',
          value: '• Start your journey with `/travel <server>`\
• Explore new servers to build your travel log\
• Every journey is automatically recorded',
          inline: false
        });
      } else {
        const recentTravels = history.slice(0, 10).map((travel, index) => {
          const date = new Date(travel.timestamp);
          const fromName = travel.fromServerName || 'Unknown Location';
          const toName = travel.toServerName || 'Unknown Destination';
          const duration = Math.floor(travel.travelTime / 1000 / 60);
          const timeAgo = Math.floor((Date.now() - travel.timestamp) / (1000 * 60 * 60 * 24));
          
          return `**${index + 1}.** ${fromName} → **${toName}**\
` +
                 `⏱️ ${duration}min travel • 📅 ${timeAgo}d ago`;
        }).join('\
\
');

        historyEmbed.addFields(
          {
            name: '🗂️ **Travel Summary**',
            value: `📊 **${history.length}** recorded journeys\
🌍 View your full adventure log below`,
            inline: false
          },
          {
            name: '🛤️ **Recent Journeys**',
            value: recentTravels,
            inline: false
          }
        );

        if (history.length > 10) {
          historyEmbed.addFields({
            name: '📋 **More History**',
            value: `... and **${history.length - 10}** more journeys\
Use \`/history stats\` for detailed analytics`,
            inline: false
          });
        }
      }

      historyEmbed.addFields({
        name: '💡 **Travel Tips**',
        value: '• **Premium Users**: Enjoy 3x faster travel speeds\
• **Waypoints**: Save favorite locations with \`/waypoints save\`\
• **Achievements**: Unlock rewards by visiting new servers\
• **Gems**: Earn 2 gems for each new server visited',
        inline: false
      });

      historyEmbed.setFooter({ 
        text: `🧭 Every journey tells a story • QuestCord Travel Log`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [historyEmbed] });
    }

    if (subcommand === 'stats') {
      const stats = getTravelStats(userId);

      const statsEmbed = new EmbedBuilder()
        .setTitle('📊🌍 **TRAVEL ANALYTICS** 🌍📊')
        .setDescription('📈 *Comprehensive analysis of your travel patterns* 📈')
        .setColor(0x9B59B6)
        .setAuthor({ 
          name: `${userPrefix} - Journey Analytics`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      // Main statistics
      const totalHours = Math.floor(stats.totalTravelTime / 1000 / 60 / 60);
      const totalMinutes = Math.floor((stats.totalTravelTime / 1000 / 60) % 60);
      const avgMinutes = Math.floor(stats.avgTravelTime / 1000 / 60);

      statsEmbed.addFields(
        {
          name: '🛫 **Journey Totals**',
          value: `**${stats.totalTravels}** total trips\
**${stats.uniqueServersVisited}** unique servers\
**${stats.recentTravels}** trips this week`,
          inline: true
        },
        {
          name: '⏱️ **Time Spent**',
          value: `**${totalHours}h ${totalMinutes}m** total travel\
**${avgMinutes}min** average per trip\
Time well invested!`,
          inline: true
        },
        {
          name: '📈 **Efficiency**',
          value: stats.totalTravels > 0 ? 
            `**${(stats.uniqueServersVisited / stats.totalTravels * 100).toFixed(1)}%** exploration rate\
**${(stats.recentTravels / 7).toFixed(1)}** trips/day average\
Steady traveler` :
            '**0%** exploration rate\
Ready to start exploring!',
          inline: true
        }
      );

      // Top destinations
      if (stats.topServers.length > 0) {
        const topDestinations = stats.topServers.map((server, index) => {
          const rankEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index] || '📍';
          return `${rankEmoji} **${server.toServerName}** - ${server.visits} visits`;
        }).join('\
');

        statsEmbed.addFields({
          name: '🏆 **Favorite Destinations**',
          value: topDestinations,
          inline: false
        });
      }

      // Achievement progress
      const milestones = [
        { count: 1, name: '🌍 Globe Trotter', achieved: stats.uniqueServersVisited >= 1 },
        { count: 5, name: '🗺️ Explorer', achieved: stats.uniqueServersVisited >= 5 },
        { count: 25, name: '🌎 World Traveler', achieved: stats.uniqueServersVisited >= 25 }
      ];

      const progressText = milestones.map(milestone => {
        const status = milestone.achieved ? '✅' : '⏳';
        const progress = milestone.achieved ? 'Unlocked!' : `${stats.uniqueServersVisited}/${milestone.count}`;
        return `${status} **${milestone.name}** (${progress})`;
      }).join('\
');

      statsEmbed.addFields({
        name: '🎯 **Travel Achievements**',
        value: progressText,
        inline: false
      });

      if (stats.totalTravels === 0) {
        statsEmbed.addFields({
          name: '🚀 **Get Started**',
          value: '• Use `/travel <server>` to begin your first journey\
• Premium users enjoy 3x faster travel speeds\
• Save favorite spots with `/waypoints save`\
• Earn gems and unlock achievements by exploring!',
          inline: false
        });
      } else {
        statsEmbed.addFields({
          name: '💎 **Travel Rewards Earned**',
          value: `• **${stats.uniqueServersVisited * 2} gems** from server visits\
• **Achievement bonuses** from milestones\
• **Travel experience** for faster navigation\
• **Waypoint access** to save favorite locations`,
          inline: false
        });
      }

      statsEmbed.setFooter({ 
        text: `📊 Keep exploring to unlock more achievements • QuestCord Analytics`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [statsEmbed] });
    }
  }
};