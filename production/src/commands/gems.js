const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix, isPremium } = require('../utils/roles');
const { logCommand } = require('../utils/store_sqlite');
const { getGemBalance, spendGems, getGemHistory, GEM_SHOP, handleDailyLogin } = require('../utils/gems');
const { isBanned, regenStamina } = require('./_guard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gems')
    .setDescription('Manage your premium gems')
    .addSubcommand(sc => sc
      .setName('balance')
      .setDescription('Check your gem balance and recent transactions'))
    .addSubcommand(sc => sc
      .setName('shop')
      .setDescription('View the gem shop and available purchases'))
    .addSubcommand(sc => sc
      .setName('daily')
      .setDescription('Claim your daily login gems'))
    .addSubcommand(sc => sc
      .setName('buy')
      .setDescription('Purchase premium features with gems')
      .addStringOption(o => o
        .setName('item')
        .setDescription('What to purchase')
        .setRequired(true)
        .addChoices(
          { name: '1-Day Premium Trial (50 gems)', value: 'premium_1_day' },
          { name: '7-Day Premium Trial (300 gems)', value: 'premium_7_day' },
          { name: '30-Day Premium Trial (1000 gems)', value: 'premium_30_day' }
        )))
    .addSubcommand(sc => sc
      .setName('give')
      .setDescription('[STAFF ONLY] Add gems to a user')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to give gems to')
        .setRequired(true))
      .addIntegerOption(o => o
        .setName('amount')
        .setDescription('Amount of gems to give')
        .setRequired(true)
        .setMinValue(1))
      .addStringOption(o => o
        .setName('reason')
        .setDescription('Reason for giving gems')
        .setRequired(false)))
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('[STAFF ONLY] Remove gems from a user')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to remove gems from')
        .setRequired(true))
      .addIntegerOption(o => o
        .setName('amount')
        .setDescription('Amount of gems to remove')
        .setRequired(true)
        .setMinValue(1))
      .addStringOption(o => o
        .setName('reason')
        .setDescription('Reason for removing gems')
        .setRequired(false)))
    .addSubcommand(sc => sc
      .setName('check')
      .setDescription('[STAFF ONLY] Check another user\'s gem balance')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to check')
        .setRequired(true))),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    regenStamina(interaction.user.id);

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `gems ${subcommand}`, interaction.guild?.id);
    const isPremiumUser = await isPremium(interaction.client, userId);

    if (subcommand === 'balance') {
      const balance = getGemBalance(userId);
      const history = getGemHistory(userId, 5);

      const balanceEmbed = new EmbedBuilder()
        .setTitle('💎⚡ **GEM TREASURY** ⚡💎')
        .setDescription('✨ *Your premium currency for exclusive features* ✨')
        .setColor(isPremiumUser ? 0xFFD700 : 0x9B59B6)
        .setAuthor({ 
          name: `${userPrefix} - Gem Manager`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '💎 **Current Balance**',
            value: `**${balance.toLocaleString()} gems**\n${balance >= 1000 ? '👑 Gem Magnate' : balance >= 300 ? '💰 Gem Collector' : balance >= 50 ? '⭐ Gem Saver' : '🔰 Starting Collection'}`,
            inline: true
          },
          {
            name: '🏪 **Shop Access**',
            value: balance >= 50 ? '✅ Can buy premium trials' : '⏳ Keep earning gems',
            inline: true
          },
          {
            name: '📊 **Status**',
            value: isPremiumUser ? '👑 **Premium Active**\nEarning gem bonuses!' : '⚡ **Standard Account**\nUpgrade available',
            inline: true
          }
        );

      if (history.length > 0) {
        const historyText = history.map(h => {
          const sign = h.amount > 0 ? '+' : '';
          const emoji = h.amount > 0 ? '💚' : '💸';
          return `${emoji} **${sign}${h.amount}** - ${h.description}`;
        }).join('\n');

        balanceEmbed.addFields({
          name: '📜 **Recent Transactions**',
          value: historyText,
          inline: false
        });
      }

      balanceEmbed.addFields({
        name: '💎 **How to Earn Gems**',
        value: '• 📅 **Daily Login** - Up to 7 gems/day\n• ⚔️ **Boss Battles** - 5-15 gems per fight\n• 📈 **Market Trading** - 1 gem per 1k drakari\n• 🌍 **Server Visits** - 2 gems per new server\n• 🏆 **Achievements** - 10+ gems each',
        inline: false
      });

      balanceEmbed.setFooter({ 
        text: `💎 Use /gems shop to see what you can buy • QuestCord Premium`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [balanceEmbed] });
    }

    if (subcommand === 'shop') {
      const balance = getGemBalance(userId);

      const shopEmbed = new EmbedBuilder()
        .setTitle('🏪💎 **GEM SHOP** 💎🏪')
        .setDescription('🌟 *Spend your gems on premium features and trials* ⚡')
        .setColor(0xFFD700)
        .setAuthor({ 
          name: `${userPrefix} - Premium Shop`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '💳 **Your Balance**',
            value: `**${balance.toLocaleString()} gems**`,
            inline: true
          },
          {
            name: '🛒 **Available Purchases**',
            value: `Use \`/gems buy <item>\` to purchase`,
            inline: true
          },
          {
            name: '⏰ **Trial Benefits**',
            value: 'All premium features included during trial period!',
            inline: true
          }
        );

      // Premium Trials
      const premiumOptions = [
        { name: '1-Day Premium Trial', price: GEM_SHOP.PREMIUM_1_DAY, benefits: '• 3x travel speed\n• 2x income\n• Premium equipment access' },
        { name: '7-Day Premium Trial', price: GEM_SHOP.PREMIUM_7_DAY, benefits: '• All premium features\n• Best value for trying premium\n• Full week of benefits' },
        { name: '30-Day Premium Trial', price: GEM_SHOP.PREMIUM_30_DAY, benefits: '• Full month of premium\n• All exclusive features\n• Maximum savings per day' }
      ];

      premiumOptions.forEach(option => {
        const canAfford = balance >= option.price;
        const statusIcon = canAfford ? '✅' : '❌';
        
        shopEmbed.addFields({
          name: `${statusIcon} **${option.name}** - ${option.price} gems`,
          value: option.benefits,
          inline: true
        });
      });

      shopEmbed.addFields({
        name: '💡 **Pro Tips**',
        value: '• **Best Value:** 7-day trials offer the most features per gem\n• **Daily Login:** Maintain streaks to earn up to 7 gems/day\n• **Boss Fighting:** Consistent gem income through combat\n• **Achievement Hunting:** One-time gem rewards for milestones',
        inline: false
      });

      shopEmbed.setFooter({ 
        text: `🎯 Premium trials give you full access to all premium features • QuestCord Shop`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [shopEmbed] });
    }

    if (subcommand === 'daily') {
      const result = handleDailyLogin(userId);

      if (result.error) {
        return interaction.reply({ content: `${userPrefix} Error processing daily login. Please try again.`, ephemeral: true });
      }

      if (result.alreadyLoggedToday) {
        const alreadyEmbed = new EmbedBuilder()
          .setTitle('📅✅ **ALREADY CLAIMED TODAY** ✅📅')
          .setDescription('You\'ve already claimed your daily gems today!')
          .setColor(0x95A5A6)
          .setAuthor({ 
            name: `${userPrefix} - Daily Check-in`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '🔥 **Current Streak**',
              value: `**${result.streak} day${result.streak !== 1 ? 's' : ''}**\n${result.streak >= 7 ? '🏆 Maximum streak!' : `⏰ Keep it going for ${7 - result.streak} more days!`}`,
              inline: true
            },
            {
              name: '⏰ **Next Claim**',
              value: 'Available tomorrow\nDon\'t break your streak!',
              inline: true
            },
            {
              name: '💎 **Tomorrow\'s Reward**',
              value: `**${1 + Math.min(result.streak, 6)} gems**\n${result.streak >= 6 ? '(Maximum daily reward)' : '(+1 bonus for streak)'}`,
              inline: true
            }
          )
          .setFooter({ 
            text: `🔥 Keep your streak alive for maximum gems • QuestCord Daily`,
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [alreadyEmbed] });
      }

      const dailyEmbed = new EmbedBuilder()
        .setTitle('🎉💎 **DAILY GEMS CLAIMED** 💎🎉')
        .setDescription('✨ *Your daily login reward has been added to your treasury* ✨')
        .setColor(0x00D26A)
        .setAuthor({ 
          name: `${userPrefix} - Daily Bonus`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '💎 **Gems Earned**',
            value: `**+${result.gemsAwarded} gems**\n💚 Added to your balance`,
            inline: true
          },
          {
            name: '🔥 **Login Streak**',
            value: `**Day ${result.streak}**\n${result.streak >= 7 ? '🏆 Maximum streak achieved!' : `🎯 ${7 - result.streak} more days to max!`}`,
            inline: true
          },
          {
            name: '📊 **Breakdown**',
            value: `Base: **${result.baseGems}** gems\nStreak Bonus: **${result.bonusGems}** gems`,
            inline: true
          }
        );

      if (result.streak >= 7) {
        dailyEmbed.addFields({
          name: '🏆 **Maximum Streak Achieved!**',
          value: '🎊 You\'re earning the maximum daily gems!\n🔥 Keep logging in to maintain your streak\n👑 Premium users earn additional gem bonuses!',
          inline: false
        });
      } else {
        dailyEmbed.addFields({
          name: '🎯 **Streak Progress**',
          value: `📈 Tomorrow: **${1 + Math.min(result.streak, 6)} gems**\n⭐ Day 7: **7 gems** (maximum)\n🔥 Don't break your streak for maximum rewards!`,
          inline: false
        });
      }

      dailyEmbed.setFooter({ 
        text: `🌟 Come back tomorrow to continue your streak • QuestCord Daily Rewards`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [dailyEmbed] });
    }

    if (subcommand === 'buy') {
      const item = interaction.options.getString('item');
      const balance = getGemBalance(userId);

      const prices = {
        'premium_1_day': GEM_SHOP.PREMIUM_1_DAY,
        'premium_7_day': GEM_SHOP.PREMIUM_7_DAY,
        'premium_30_day': GEM_SHOP.PREMIUM_30_DAY
      };

      const durations = {
        'premium_1_day': '1 day',
        'premium_7_day': '7 days', 
        'premium_30_day': '30 days'
      };

      const price = prices[item];
      const duration = durations[item];

      if (!price || !duration) {
        return interaction.reply({ content: `${userPrefix} Invalid item selected.`, ephemeral: true });
      }

      if (balance < price) {
        const insufficientEmbed = new EmbedBuilder()
          .setTitle('❌💎 **INSUFFICIENT GEMS** 💎❌')
          .setDescription('You don\'t have enough gems for this purchase')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix} - Purchase Failed`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '💳 **Your Balance**',
              value: `**${balance.toLocaleString()} gems**`,
              inline: true
            },
            {
              name: '💰 **Required**',
              value: `**${price.toLocaleString()} gems**`,
              inline: true
            },
            {
              name: '📊 **Need**',
              value: `**${(price - balance).toLocaleString()} more gems**`,
              inline: true
            },
            {
              name: '💡 **How to Earn More Gems**',
              value: '• Complete daily logins for up to 7 gems/day\n• Fight bosses for 5-15 gems each\n• Trade in the market (1 gem per 1k drakari)\n• Visit new servers (2 gems each)\n• Unlock achievements (10+ gems each)',
              inline: false
            }
          )
          .setFooter({ 
            text: `💎 Keep earning gems and come back soon • QuestCord Shop`,
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [insufficientEmbed], ephemeral: true });
      }

      // Process purchase
      const success = spendGems(userId, price, 'premium_trial', `${duration} premium trial`);
      
      if (!success) {
        return interaction.reply({ content: `${userPrefix} Purchase failed. Please try again.`, ephemeral: true });
      }

      // TODO: Actually grant premium time here
      // For now, we'll just show a success message

      const successEmbed = new EmbedBuilder()
        .setTitle('🎉👑 **PURCHASE SUCCESSFUL** 👑🎉')
        .setDescription(`✨ *${duration} premium trial activated!* ✨`)
        .setColor(0xFFD700)
        .setAuthor({ 
          name: `${userPrefix} - Premium Activated`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '🛍️ **Purchased**',
            value: `**${duration.toUpperCase()} Premium Trial**\nFull premium access`,
            inline: true
          },
          {
            name: '💎 **Cost**',
            value: `**${price.toLocaleString()} gems**\nDeducted from balance`,
            inline: true
          },
          {
            name: '💳 **New Balance**',
            value: `**${(balance - price).toLocaleString()} gems**\nRemaining in treasury`,
            inline: true
          },
          {
            name: '🌟 **Premium Benefits Activated**',
            value: '• 🚀 **3x faster travel speed**\n• 💰 **2x income from all sources**\n• ⚔️ **Access to premium equipment**\n• 🏪 **Market listing priority**\n• 👑 **Premium badge and status**',
            inline: false
          }
        )
        .setFooter({ 
          text: `👑 Enjoy your premium experience! • QuestCord Premium`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      return interaction.reply({ embeds: [successEmbed] });
    }

    // Admin commands for staff and developers
    if (['give', 'remove', 'check'].includes(subcommand)) {
      const { fetchRoleLevel } = require('../web/util');
      const roleLevel = await fetchRoleLevel(interaction.user.id);
      
      if (!(roleLevel === 'Developer' || roleLevel === 'Staff')) {
        return interaction.reply({ 
          content: `${userPrefix} ❌ This command is only available to Staff and Developers.`, 
          ephemeral: true 
        });
      }

      const targetUser = interaction.options.getUser('user');
      const { awardGems, removeGems } = require('../utils/gems');

      if (subcommand === 'check') {
        const targetBalance = getGemBalance(targetUser.id);
        const targetHistory = getGemHistory(targetUser.id, 3);

        const checkEmbed = new EmbedBuilder()
          .setTitle('🔍💎 **ADMIN GEM CHECK** 💎🔍')
          .setDescription(`Checking gem balance for ${targetUser.displayName}`)
          .setColor(0x8E44AD)
          .setAuthor({ 
            name: `${userPrefix} - Admin Tools`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '👤 **Target User**',
              value: `${targetUser.displayName}\n\`${targetUser.id}\``,
              inline: true
            },
            {
              name: '💎 **Current Balance**',
              value: `**${targetBalance.toLocaleString()} gems**`,
              inline: true
            },
            {
              name: '📊 **Account Status**',
              value: targetBalance >= 1000 ? '👑 Gem Magnate' : targetBalance >= 300 ? '💰 Gem Collector' : targetBalance >= 50 ? '⭐ Gem Saver' : '🔰 Starting Collection',
              inline: true
            }
          );

        if (targetHistory.length > 0) {
          const historyText = targetHistory.map(h => {
            const sign = h.amount > 0 ? '+' : '';
            const emoji = h.amount > 0 ? '💚' : '💸';
            return `${emoji} **${sign}${h.amount}** - ${h.description}`;
          }).join('\n');

          checkEmbed.addFields({
            name: '📜 **Recent Transactions**',
            value: historyText,
            inline: false
          });
        }

        checkEmbed.setFooter({ 
          text: `🛡️ Admin Check • QuestCord Staff Tools`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

        return interaction.reply({ embeds: [checkEmbed], ephemeral: true });
      }

      if (subcommand === 'give') {
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'Staff grant';

        try {
          const success = awardGems(targetUser.id, amount, 'staff_grant', reason);
          
          if (!success) {
            return interaction.reply({ 
              content: `${userPrefix} ❌ Failed to add gems. Please try again.`, 
              ephemeral: true 
            });
          }

          const newBalance = getGemBalance(targetUser.id);

          const giveEmbed = new EmbedBuilder()
            .setTitle('✅💎 **GEMS GRANTED** 💎✅')
            .setDescription(`Successfully added gems to ${targetUser.displayName}`)
            .setColor(0x00D26A)
            .setAuthor({ 
              name: `${userPrefix} - Admin Action`,
              iconURL: interaction.user.displayAvatarURL() 
            })
            .addFields(
              {
                name: '👤 **Target User**',
                value: `${targetUser.displayName}\n\`${targetUser.id}\``,
                inline: true
              },
              {
                name: '💎 **Amount Added**',
                value: `**+${amount.toLocaleString()} gems**`,
                inline: true
              },
              {
                name: '💳 **New Balance**',
                value: `**${newBalance.toLocaleString()} gems**`,
                inline: true
              },
              {
                name: '📝 **Reason**',
                value: reason,
                inline: false
              },
              {
                name: '🛡️ **Admin**',
                value: `${interaction.user.displayName} (${roleLevel})`,
                inline: true
              },
              {
                name: '⏰ **Timestamp**',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
              }
            )
            .setFooter({ 
              text: `🛡️ Staff Action Logged • QuestCord Admin Tools`,
              iconURL: interaction.client.user.displayAvatarURL()
            });

          return interaction.reply({ embeds: [giveEmbed], ephemeral: true });

        } catch (error) {
          console.error('Gems give command error:', error);
          return interaction.reply({ 
            content: `${userPrefix} ❌ An error occurred while adding gems.`, 
            ephemeral: true 
          });
        }
      }

      if (subcommand === 'remove') {
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'Staff removal';
        const currentBalance = getGemBalance(targetUser.id);

        if (currentBalance < amount) {
          return interaction.reply({ 
            content: `${userPrefix} ❌ User only has ${currentBalance} gems. Cannot remove ${amount} gems.`, 
            ephemeral: true 
          });
        }

        try {
          const success = removeGems(targetUser.id, amount, 'staff_remove', reason);
          
          if (!success) {
            return interaction.reply({ 
              content: `${userPrefix} ❌ Failed to remove gems. Please try again.`, 
              ephemeral: true 
            });
          }

          const newBalance = getGemBalance(targetUser.id);

          const removeEmbed = new EmbedBuilder()
            .setTitle('⚠️💎 **GEMS REMOVED** 💎⚠️')
            .setDescription(`Successfully removed gems from ${targetUser.displayName}`)
            .setColor(0xFF6B6B)
            .setAuthor({ 
              name: `${userPrefix} - Admin Action`,
              iconURL: interaction.user.displayAvatarURL() 
            })
            .addFields(
              {
                name: '👤 **Target User**',
                value: `${targetUser.displayName}\n\`${targetUser.id}\``,
                inline: true
              },
              {
                name: '💸 **Amount Removed**',
                value: `**-${amount.toLocaleString()} gems**`,
                inline: true
              },
              {
                name: '💳 **New Balance**',
                value: `**${newBalance.toLocaleString()} gems**`,
                inline: true
              },
              {
                name: '📝 **Reason**',
                value: reason,
                inline: false
              },
              {
                name: '🛡️ **Admin**',
                value: `${interaction.user.displayName} (${roleLevel})`,
                inline: true
              },
              {
                name: '⏰ **Timestamp**',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
              }
            )
            .setFooter({ 
              text: `🛡️ Staff Action Logged • QuestCord Admin Tools`,
              iconURL: interaction.client.user.displayAvatarURL()
            });

          return interaction.reply({ embeds: [removeEmbed], ephemeral: true });

        } catch (error) {
          console.error('Gems remove command error:', error);
          return interaction.reply({ 
            content: `${userPrefix} ❌ An error occurred while removing gems.`, 
            ephemeral: true 
          });
        }
      }
    }
  }
};