const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const { getUserAchievements, getAchievementProgress, ACHIEVEMENTS } = require('../utils/achievements');
const { db, logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your achievements and progress')
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('View all your unlocked achievements'))
    .addSubcommand(sc => sc
      .setName('progress')
      .setDescription('View your progress toward achievements'))
    .addSubcommand(sc => sc
      .setName('claim')
      .setDescription('Claim pending achievement rewards')
      .addStringOption(o => o
        .setName('achievement')
        .setDescription('Specific achievement to claim (optional)')
        .setRequired(false))),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    regenStamina(interaction.user.id);

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `achievements ${subcommand}`, interaction.guild?.id);

    if (subcommand === 'list') {
      const achievements = getUserAchievements(userId);
      const unlockedAchievements = achievements.filter(a => a.unlockedAt);

      const listEmbed = new EmbedBuilder()
        .setTitle('🏆⭐ **ACHIEVEMENT COLLECTION** ⭐🏆')
        .setDescription('✨ *Your earned accomplishments and milestones* ✨')
        .setColor(0xFFD700)
        .setAuthor({ 
          name: `${userPrefix} - Achievement Hunter`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      if (unlockedAchievements.length === 0) {
        listEmbed.addFields(
          {
            name: '🎯 **No Achievements Yet**',
            value: '• Start your journey by exploring servers\
• Fight bosses to earn combat achievements\
• Use the market and crafting system\
• Every action brings you closer to glory!',
            inline: false
          },
          {
            name: '🚀 **Quick Start Guide**',
            value: '• `/travel <server>` - Begin exploring for travel achievements\
• `/boss attack` - Fight for combat milestones\
• `/craft` - Create items for crafting goals\
• `/gems daily` - Maintain login streaks',
            inline: false
          }
        );
      } else {
        // Achievement summary
        const totalGems = unlockedAchievements.reduce((sum, a) => sum + (a.reward.gems || 0), 0);
        const totalPremiumTime = unlockedAchievements.reduce((sum, a) => sum + (a.reward.premiumTime || 0), 0);

        listEmbed.addFields({
          name: '📊 **Achievement Summary**',
          value: `🏆 **${unlockedAchievements.length}** achievements unlocked\
💎 **${totalGems}** gems earned\
⏰ **${Math.floor(totalPremiumTime / 24)}** days premium earned\
🎯 **${Object.keys(ACHIEVEMENTS).length - unlockedAchievements.length}** achievements remaining`,
          inline: false
        });

        // Group achievements by category for better display
        const categories = {
          'travel': { name: '🌍 Exploration', achievements: [] },
          'boss': { name: '⚔️ Combat', achievements: [] },
          'craft': { name: '🔨 Crafting', achievements: [] },
          'wealth': { name: '💰 Wealth', achievements: [] },
          'social': { name: '👥 Social', achievements: [] },
          'other': { name: '🌟 Special', achievements: [] }
        };

        // Categorize achievements
        unlockedAchievements.forEach(achievement => {
          const id = achievement.id.toLowerCase();
          if (id.includes('travel') || id.includes('visit') || id.includes('explorer')) {
            categories.travel.achievements.push(achievement);
          } else if (id.includes('boss') || id.includes('kill') || id.includes('hunter') || id.includes('warrior')) {
            categories.boss.achievements.push(achievement);
          } else if (id.includes('craft') || id.includes('crafter')) {
            categories.craft.achievements.push(achievement);
          } else if (id.includes('million') || id.includes('wealth')) {
            categories.wealth.achievements.push(achievement);
          } else if (id.includes('social') || id.includes('butterfly')) {
            categories.social.achievements.push(achievement);
          } else {
            categories.other.achievements.push(achievement);
          }
        });

        // Display achievements by category
        Object.entries(categories).forEach(([key, category]) => {
          if (category.achievements.length > 0) {
            const achievementList = category.achievements.map(achievement => {
              const unlockedDate = new Date(achievement.unlockedAt).toLocaleDateString();
              const rewardText = [];
              if (achievement.reward.gems > 0) rewardText.push(`${achievement.reward.gems} gems`);
              if (achievement.reward.premiumTime > 0) rewardText.push(`${Math.floor(achievement.reward.premiumTime / 24)}d premium`);
              
              return `${achievement.icon} **${achievement.name}**\
📋 ${achievement.description}\
🎁 ${rewardText.join(', ')} • 📅 ${unlockedDate}`;
            }).join('\
\
');

            listEmbed.addFields({
              name: `${category.name} (${category.achievements.length})`,
              value: achievementList.length > 1000 ? achievementList.substring(0, 1000) + '...' : achievementList,
              inline: false
            });
          }
        });
      }

      listEmbed.addFields({
        name: '💡 **Achievement Tips**',
        value: '• **Diverse Activities**: Different actions unlock different achievements\
• **Persistence**: Many achievements require sustained effort\
• **Exploration**: Try visiting many different servers\
• **Premium Rewards**: Some achievements grant premium time!',
        inline: false
      });

      listEmbed.setFooter({ 
        text: `🏆 Achievements showcase your dedication • QuestCord Achievements`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [listEmbed] });
    }

    if (subcommand === 'progress') {
      const progress = getAchievementProgress(userId);
      const allAchievements = Object.values(ACHIEVEMENTS);
      const userAchievements = getUserAchievements(userId);
      const unlockedIds = new Set(userAchievements.map(a => a.id));

      const progressEmbed = new EmbedBuilder()
        .setTitle('📈🎯 **ACHIEVEMENT PROGRESS** 🎯📈')
        .setDescription('⏳ *Your journey toward greatness continues* ⏳')
        .setColor(0x3498DB)
        .setAuthor({ 
          name: `${userPrefix} - Progress Tracker`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      // Current statistics
      progressEmbed.addFields({
        name: '📊 **Current Statistics**',
        value: `🌍 **${progress.serversVisited}** servers visited\
⚔️ **${progress.bossKills}** bosses defeated\
🔨 **${progress.itemsCrafted}** items crafted\
💰 **${progress.drakari?.toLocaleString()}** drakari owned\
📅 **${progress.loginStreak}** login streak\
⚔️ **${progress.equipmentCount}** equipment owned\
📈 **${progress.marketTradeCount}** market trades`,
        inline: false
      });

      // Show progress toward next achievements
      const pendingAchievements = [];
      
      // Travel achievements
      if (!unlockedIds.has('first_travel') && progress.serversVisited === 0) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.FIRST_TRAVEL, 
          progress: progress.serversVisited, 
          needed: 1 
        });
      }
      if (!unlockedIds.has('visit_5_servers') && progress.serversVisited < 5) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.VISIT_5_SERVERS, 
          progress: progress.serversVisited, 
          needed: 5 
        });
      }
      if (!unlockedIds.has('visit_25_servers') && progress.serversVisited < 25) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.VISIT_25_SERVERS, 
          progress: progress.serversVisited, 
          needed: 25 
        });
      }

      // Boss achievements
      if (!unlockedIds.has('first_boss_kill') && progress.bossKills === 0) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.FIRST_BOSS_KILL, 
          progress: progress.bossKills, 
          needed: 1 
        });
      }
      if (!unlockedIds.has('boss_killer_10') && progress.bossKills < 10) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.BOSS_KILLER_10, 
          progress: progress.bossKills, 
          needed: 10 
        });
      }
      if (!unlockedIds.has('boss_killer_50') && progress.bossKills < 50) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.BOSS_KILLER_50, 
          progress: progress.bossKills, 
          needed: 50 
        });
      }

      // Other achievements
      if (!unlockedIds.has('craft_master') && progress.itemsCrafted < 100) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.CRAFT_MASTER, 
          progress: progress.itemsCrafted, 
          needed: 100 
        });
      }
      if (!unlockedIds.has('millionaire') && progress.drakari < 1000000) {
        pendingAchievements.push({ 
          ...ACHIEVEMENTS.MILLIONAIRE, 
          progress: progress.drakari, 
          needed: 1000000 
        });
      }

      // Display next achievements to work toward (up to 6)
      if (pendingAchievements.length > 0) {
        const nextAchievements = pendingAchievements.slice(0, 6).map(achievement => {
          const percentage = Math.min(100, Math.round((achievement.progress / achievement.needed) * 100));
          const progressBar = generateProgressBar(achievement.progress, achievement.needed);
          const rewardText = [];
          if (achievement.reward.gems > 0) rewardText.push(`${achievement.reward.gems} gems`);
          if (achievement.reward.premiumTime > 0) rewardText.push(`${Math.floor(achievement.reward.premiumTime / 24)}d premium`);
          
          return `${achievement.icon} **${achievement.name}**\
📋 ${achievement.description}\
${progressBar} ${achievement.progress.toLocaleString()}/${achievement.needed.toLocaleString()} (${percentage}%)\
🎁 Reward: ${rewardText.join(', ')}`;
        }).join('\
\
');

        progressEmbed.addFields({
          name: '🎯 **Next Achievements**',
          value: nextAchievements,
          inline: false
        });
      } else {
        progressEmbed.addFields({
          name: '🌟 **All Available Achievements Complete**',
          value: 'Congratulations! You have unlocked all currently available achievements. Keep playing as more achievements may be added in future updates!',
          inline: false
        });
      }

      // Show motivation and tips
      const completionRate = (userAchievements.length / allAchievements.length * 100).toFixed(1);
      progressEmbed.addFields({
        name: '🏆 **Achievement Status**',
        value: `📊 **${completionRate}%** completed (${userAchievements.length}/${allAchievements.length})\
${
          completionRate >= 80 ? '👑 **Achievement Master**' :
          completionRate >= 60 ? '🏅 **Dedicated Achiever**' :
          completionRate >= 40 ? '⭐ **Progress Champion**' :
          completionRate >= 20 ? '📈 **Rising Star**' :
          '🎯 **Achievement Hunter**'
        }\
🎮 Keep exploring, fighting, and crafting!`,
        inline: false
      });

      progressEmbed.setFooter({ 
        text: `📈 Your progress is automatically tracked • QuestCord Achievement System`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [progressEmbed] });
    }

    if (subcommand === 'claim') {
      // For now, achievements auto-reward when unlocked, but we can show claim status
      const achievements = getUserAchievements(userId);
      const unlockedAchievements = achievements.filter(a => a.unlockedAt);

      if (unlockedAchievements.length === 0) {
        return interaction.reply({ 
          content: `${userPrefix} You haven't unlocked any achievements yet. Use \`/achievements progress\` to see what you're working toward!`, 
          ephemeral: true 
        });
      }

      const claimEmbed = new EmbedBuilder()
        .setTitle('🎁✅ **ACHIEVEMENT REWARDS** ✅🎁')
        .setDescription('💎 *All achievement rewards are automatically granted when unlocked* 💎')
        .setColor(0x00D26A)
        .setAuthor({ 
          name: `${userPrefix} - Reward Collection`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      // Calculate total rewards earned
      const totalGems = unlockedAchievements.reduce((sum, a) => sum + (a.reward.gems || 0), 0);
      const totalPremiumHours = unlockedAchievements.reduce((sum, a) => sum + (a.reward.premiumTime || 0), 0);

      claimEmbed.addFields(
        {
          name: '💰 **Total Rewards Earned**',
          value: `💎 **${totalGems}** gems earned\
⏰ **${Math.floor(totalPremiumHours / 24)}** days premium time\
🏆 **${unlockedAchievements.length}** achievements completed`,
          inline: true
        },
        {
          name: '⚡ **Auto-Claiming System**',
          value: '• ✅ Rewards granted instantly\
• 💎 Gems added to balance\
• ⏰ Premium time activated\
• 📧 No manual claiming needed',
          inline: true
        }
      );

      // Recent achievements (last 5)
      const recentAchievements = unlockedAchievements
        .sort((a, b) => b.unlockedAt - a.unlockedAt)
        .slice(0, 5)
        .map(achievement => {
          const unlockedDate = new Date(achievement.unlockedAt).toLocaleDateString();
          const rewardText = [];
          if (achievement.reward.gems > 0) rewardText.push(`${achievement.reward.gems} gems`);
          if (achievement.reward.premiumTime > 0) rewardText.push(`${Math.floor(achievement.reward.premiumTime / 24)}d premium`);
          
          return `${achievement.icon} **${achievement.name}** (${unlockedDate})\
🎁 ${rewardText.join(', ')}`;
        }).join('\
\
');

      if (recentAchievements) {
        claimEmbed.addFields({
          name: '🕐 **Recent Achievements**',
          value: recentAchievements,
          inline: false
        });
      }

      claimEmbed.addFields({
        name: '💡 **Achievement System**',
        value: '• **Instant Rewards**: All achievement rewards are automatically granted\
• **Progress Tracking**: Your actions are continuously monitored\
• **Fair Distribution**: Each achievement can only be earned once\
• **Premium Benefits**: Some achievements include premium time bonuses',
        inline: false
      });

      claimEmbed.setFooter({ 
        text: `🎁 Achievement rewards are automatically applied • QuestCord System`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [claimEmbed] });
    }
  }
};

// Helper function to generate progress bars
function generateProgressBar(current, target, length = 10) {
  const progress = Math.min(current, target);
  const percentage = progress / target;
  const filledBars = Math.round(percentage * length);
  const emptyBars = length - filledBars;
  
  const filled = '█'.repeat(filledBars);
  const empty = '░'.repeat(emptyBars);
  
  return `[${filled}${empty}]`;
}