const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const { getUserChallenges, getChallengeStats } = require('../utils/challenges');
const { logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('challenges')
    .setDescription('View and manage your daily and weekly challenges')
    .addSubcommand(sc => sc
      .setName('active')
      .setDescription('View your current active challenges'))
    .addSubcommand(sc => sc
      .setName('stats')
      .setDescription('View your challenge completion statistics')),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    regenStamina(interaction.user.id);

    const subcommand = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `challenges ${subcommand}`, interaction.guild?.id);
    const userId = interaction.user.id;

    if (subcommand === 'active') {
      const challenges = getUserChallenges(userId);
      const dailyChallenges = challenges.filter(c => c.type === 'daily');
      const weeklyChallenges = challenges.filter(c => c.type === 'weekly');

      const challengesEmbed = new EmbedBuilder()
        .setTitle('🎯⭐ **ACTIVE CHALLENGES** ⭐🎯')
        .setDescription('✨ *Complete challenges to earn gems and drakari rewards* ✨')
        .setColor(0xF39C12)
        .setAuthor({ 
          name: `${userPrefix} - Challenge Master`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      // Daily challenges section
      if (dailyChallenges.length > 0) {
        const dailyText = dailyChallenges.map(challenge => {
          const progress = Math.min(challenge.progress, challenge.target);
          const percentage = Math.round((progress / challenge.target) * 100);
          const progressBar = generateProgressBar(progress, challenge.target);
          const status = challenge.completed ? '✅' : progress >= challenge.target ? '🎉' : '⏳';
          
          return `${status} **${challenge.name}**\
` +
                 `📋 ${challenge.description}\
` +
                 `${progressBar} ${progress}/${challenge.target} (${percentage}%)\
` +
                 `💎 Reward: ${challenge.reward.gems} gems + ${challenge.reward.drakari?.toLocaleString()} drakari`;
        }).join('\
\
');

        challengesEmbed.addFields({
          name: '📅 **Daily Challenges** (Reset at midnight)',
          value: dailyText,
          inline: false
        });
      }

      // Weekly challenges section
      if (weeklyChallenges.length > 0) {
        const weeklyText = weeklyChallenges.map(challenge => {
          const progress = Math.min(challenge.progress, challenge.target);
          const percentage = Math.round((progress / challenge.target) * 100);
          const progressBar = generateProgressBar(progress, challenge.target);
          const status = challenge.completed ? '✅' : progress >= challenge.target ? '🎉' : '⏳';
          
          return `${status} **${challenge.name}**\
` +
                 `📋 ${challenge.description}\
` +
                 `${progressBar} ${progress}/${challenge.target} (${percentage}%)\
` +
                 `💎 Reward: ${challenge.reward.gems} gems + ${challenge.reward.drakari?.toLocaleString()} drakari`;
        }).join('\
\
');

        challengesEmbed.addFields({
          name: '🗓️ **Weekly Challenges** (Reset on Monday)',
          value: weeklyText,
          inline: false
        });
      }

      if (challenges.length === 0) {
        challengesEmbed.addFields(
          {
            name: '🎯 **No Active Challenges**',
            value: '• Daily challenges reset every day at midnight\
• Weekly challenges reset every Monday\
• Complete various activities to progress\
• Earn gems and drakari as rewards!',
            inline: false
          },
          {
            name: '🚀 **How to Progress**',
            value: '• **Travel**: Visit new servers to complete exploration challenges\
• **Combat**: Fight bosses for damage and participation goals\
• **Trading**: Buy/sell items in the market\
• **Crafting**: Create items to fulfill production quotas\
• **Daily Login**: Maintain your login streak',
            inline: false
          }
        );
      } else {
        // Show completion summary
        const completedDaily = dailyChallenges.filter(c => c.completed).length;
        const totalDaily = dailyChallenges.length;
        const completedWeekly = weeklyChallenges.filter(c => c.completed).length;
        const totalWeekly = weeklyChallenges.length;

        challengesEmbed.addFields({
          name: '📊 **Progress Summary**',
          value: `📅 **Daily**: ${completedDaily}/${totalDaily} completed\
🗓️ **Weekly**: ${completedWeekly}/${totalWeekly} completed\
🏆 **Total Rewards Available**: ${calculateTotalRewards(challenges)} gems\
💡 **Tip**: Activities often count toward multiple challenges!`,
          inline: false
        });

        challengesEmbed.addFields({
          name: '🎮 **Quick Activities**',
          value: '• `/travel <server>` - Explore for travel challenges\
• `/boss` - Fight bosses for combat goals\
• `/market search` - Trade items for merchant challenges\
• `/craft` - Create items for crafting objectives',
          inline: false
        });
      }

      challengesEmbed.setFooter({ 
        text: `🎯 Challenge progress updates automatically • QuestCord Challenges`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [challengesEmbed] });
    }

    if (subcommand === 'stats') {
      const stats = getChallengeStats(userId);

      const statsEmbed = new EmbedBuilder()
        .setTitle('📊🏆 **CHALLENGE STATISTICS** 🏆📊')
        .setDescription('📈 *Your challenge completion history and achievements* 📈')
        .setColor(0x9B59B6)
        .setAuthor({ 
          name: `${userPrefix} - Achievement Tracker`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      if (stats.totalChallenges === 0) {
        statsEmbed.addFields(
          {
            name: '📭 **No Challenge History**',
            value: '• Start completing daily and weekly challenges\
• Build your achievement record over time\
• Track your improvement and consistency\
• Earn valuable rewards for your efforts',
            inline: false
          },
          {
            name: '🎯 **Get Started Today**',
            value: '• Check `/challenges active` to see available challenges\
• Daily challenges refresh every 24 hours\
• Weekly challenges provide bigger rewards\
• Every activity counts toward your progress!',
            inline: false
          }
        );
      } else {
        // Main statistics
        statsEmbed.addFields(
          {
            name: '🏆 **Completion Record**',
            value: `**${stats.completedChallenges}** challenges completed\
**${stats.totalChallenges}** total attempted\
**${stats.completionRate.toFixed(1)}%** completion rate\
${getCompletionRank(stats.completionRate)}`,
            inline: true
          },
          {
            name: '📊 **Challenge Breakdown**',
            value: `**${stats.dailyChallenges}** daily challenges\
**${stats.weeklyChallenges}** weekly challenges\
**${Math.round(stats.dailyChallenges / 7)}** weeks active\
${getActivityLevel(stats)}`,
            inline: true
          },
          {
            name: '💎 **Estimated Rewards**',
            value: `**${estimateGemsEarned(stats)}** gems earned\
**${estimateDrakariEarned(stats)}** drakari earned\
**${stats.completedChallenges * 15}** avg gems/challenge\
Steady progress pays off!`,
            inline: true
          }
        );

        // Progress analysis
        const efficiency = stats.completionRate;
        let performanceInsight;
        
        if (efficiency >= 80) {
          performanceInsight = '🌟 **Elite Challenger** - Exceptional completion rate!';
        } else if (efficiency >= 60) {
          performanceInsight = '⭐ **Dedicated Achiever** - Strong challenge performance!';
        } else if (efficiency >= 40) {
          performanceInsight = '🔥 **Steady Climber** - Good progress, keep it up!';
        } else if (efficiency >= 20) {
          performanceInsight = '📈 **Getting Started** - Building momentum!';
        } else {
          performanceInsight = '🎯 **Potential Unlocked** - Ready to tackle more challenges!';
        }

        statsEmbed.addFields({
          name: '📈 **Performance Analysis**',
          value: `${performanceInsight}\
\
• **Consistency**: ${getConsistencyRating(stats)}\
• **Favorite Type**: ${stats.dailyChallenges > stats.weeklyChallenges ? 'Daily challenges' : 'Weekly challenges'}\
• **Activity Pattern**: Regular participant\
• **Achievement Level**: ${getAchievementTier(stats.completedChallenges)}`,
          inline: false
        });

        // Milestones and goals
        const nextMilestone = getNextMilestone(stats.completedChallenges);
        statsEmbed.addFields({
          name: '🎖️ **Milestones & Goals**',
          value: `**Current Tier**: ${getAchievementTier(stats.completedChallenges)}\
**Next Goal**: ${nextMilestone.name} (${stats.completedChallenges}/${nextMilestone.target})\
**Progress to Next**: ${Math.round((stats.completedChallenges / nextMilestone.target) * 100)}%\
**Completion Streak**: ${stats.completionRate >= 75 ? 'Excellent' : stats.completionRate >= 50 ? 'Good' : 'Building'}`,
          inline: false
        });
      }

      statsEmbed.addFields({
        name: '💡 **Challenge Tips**',
        value: '• **Daily Routine**: Check challenges each morning\
• **Efficiency**: Many activities count for multiple challenges\
• **Planning**: Weekly challenges need sustained effort\
• **Rewards**: Completed challenges provide great gem income',
        inline: false
      });

      statsEmbed.setFooter({ 
        text: `🏆 Keep challenging yourself to unlock greater rewards • QuestCord`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [statsEmbed] });
    }
  }
};

// Helper functions
function generateProgressBar(current, target, length = 10) {
  const progress = Math.min(current, target);
  const percentage = progress / target;
  const filledBars = Math.round(percentage * length);
  const emptyBars = length - filledBars;
  
  const filled = '█'.repeat(filledBars);
  const empty = '░'.repeat(emptyBars);
  
  return `[${filled}${empty}]`;
}

function calculateTotalRewards(challenges) {
  return challenges.reduce((total, challenge) => {
    return total + (challenge.completed ? 0 : challenge.reward.gems);
  }, 0);
}

function getCompletionRank(rate) {
  if (rate >= 90) return '👑 Master';
  if (rate >= 75) return '🏅 Expert';
  if (rate >= 60) return '⭐ Proficient';
  if (rate >= 40) return '🔥 Improving';
  return '🎯 Learning';
}

function getActivityLevel(stats) {
  const weeksActive = Math.max(1, Math.round(stats.dailyChallenges / 7));
  const avgPerWeek = stats.totalChallenges / weeksActive;
  
  if (avgPerWeek >= 4) return '🌟 Very Active';
  if (avgPerWeek >= 2.5) return '⚡ Active';
  if (avgPerWeek >= 1.5) return '📈 Regular';
  return '🎯 Casual';
}

function getConsistencyRating(stats) {
  const rate = stats.completionRate;
  if (rate >= 80) return 'Highly Consistent';
  if (rate >= 60) return 'Very Consistent';
  if (rate >= 40) return 'Fairly Consistent';
  return 'Building Consistency';
}

function getAchievementTier(completed) {
  if (completed >= 100) return '👑 Legendary Challenger';
  if (completed >= 50) return '🏆 Master Achiever';
  if (completed >= 25) return '⭐ Experienced Challenger';
  if (completed >= 10) return '🔥 Active Participant';
  if (completed >= 5) return '📈 Regular Challenger';
  return '🎯 Getting Started';
}

function getNextMilestone(completed) {
  const milestones = [
    { name: 'First 5 Challenges', target: 5 },
    { name: 'Challenge Veteran', target: 10 },
    { name: 'Experienced Challenger', target: 25 },
    { name: 'Master Achiever', target: 50 },
    { name: 'Legendary Challenger', target: 100 },
    { name: 'Ultimate Champion', target: 200 }
  ];
  
  return milestones.find(m => completed < m.target) || { name: 'Ultimate Champion', target: 200 };
}

function estimateGemsEarned(stats) {
  return Math.round(stats.completedChallenges * 15); // Average 15 gems per challenge
}

function estimateDrakariEarned(stats) {
  return (stats.completedChallenges * 6000).toLocaleString(); // Average 6000 drakari per challenge
}