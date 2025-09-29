const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { isStaffOrDev, getUserPrefix, isPremium } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');
const { MAX_H, MAX_S } = require('../utils/regen');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setstats')
    .setDescription('⚙️ Set health or stamina for any user (Staff/Developer only)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('👤 Target user to modify')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('stat')
        .setDescription('📊 Which stat to modify')
        .setRequired(true)
        .addChoices(
          { name: '❤️ Health', value: 'health' },
          { name: '⚡ Stamina', value: 'stamina' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('🔢 Amount to set (0-10000 for Staff/Dev)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(10000)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('📝 Reason for stat modification (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    const userId = interaction.user.id;

    // Check if user is staff or developer
    if (!await isStaffOrDev(interaction.client, userId)) {
      return interaction.reply({
        content: `${userPrefix} ❌ This command is only available to Staff and Developers.`,
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser('user');
    const stat = interaction.options.getString('stat');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'Administrative adjustment';

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `setstats ${stat}`, interaction.guild?.id);

    try {
      // Get current player data
      let existingPlayer = db.prepare('SELECT * FROM players WHERE userId=?').get(targetUser.id);

      if (!existingPlayer) {
        // Create player entry if doesn't exist
        const guildId = interaction.guildId || process.env.SPAWN_GUILD_ID;

        if (!guildId) {
          return interaction.reply({
            content: `${userPrefix} ❌ Error: No guild context available and SPAWN_GUILD_ID not configured.`,
            ephemeral: true
          });
        }

        db.prepare(`
          INSERT INTO players (userId, name, health, stamina, locationGuildId)
          VALUES (?, ?, ?, ?, ?)
        `).run(targetUser.id, targetUser.username, 100, 100, guildId);

        existingPlayer = { health: 100, stamina: 100, isPremium: 0 };
      }

      // Get role level and premium status
      const adminRole = await fetchRoleLevel(interaction.user.id);
      const targetIsPremium = await isPremium(interaction.client, targetUser.id);

      // Calculate max stats based on premium status
      const maxHealth = targetIsPremium ? MAX_H * 1.5 : MAX_H;
      const maxStamina = MAX_S;

      // Store previous value
      const previousValue = existingPlayer[stat] || (stat === 'health' ? 100 : 100);

      // Update the specific stat
      const column = stat === 'health' ? 'health' : 'stamina';
      db.prepare(`UPDATE players SET ${column}=?, staminaUpdatedAt=? WHERE userId=?`)
        .run(amount, Date.now(), targetUser.id);

      // Log the action
      logger.info('setstats: %s set %s to %s for user %s (reason: %s)', userId, stat, amount, targetUser.id, reason);

      // Create visual stat bars
      const createBar = (value, max) => {
        const percentage = Math.min(100, (value / max) * 100);
        const filledBars = Math.floor(percentage / 10);
        const emptyBars = 10 - filledBars;
        return `${'█'.repeat(filledBars)}${'▒'.repeat(emptyBars)} ${Math.round(percentage)}%`;
      };

      const statIcon = stat === 'health' ? '❤️' : '⚡';
      const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
      const statMax = stat === 'health' ? maxHealth : maxStamina;
      const statBar = createBar(amount, statMax);

      const embed = new EmbedBuilder()
        .setTitle(`⚙️✅ **STAT MODIFIED** ✅⚙️`)
        .setDescription(`${statIcon} *${statName} successfully updated for player* ⚡`)
        .setColor(stat === 'health' ? 0xE74C3C : 0x3498DB)
        .setAuthor({
          name: `${userPrefix} - Staff Tools`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '👤 **Target Player**',
            value: `**${targetUser.displayName}**\n\`${targetUser.id}\`\n${targetIsPremium ? '👑 Premium User' : '⭐ Standard User'}`,
            inline: true
          },
          {
            name: `${statIcon} **${statName} Update**`,
            value: `**Previous:** ${previousValue.toLocaleString()}\n**New Value:** ${amount.toLocaleString()}\n**Change:** ${amount > previousValue ? '+' : ''}${(amount - previousValue).toLocaleString()}`,
            inline: true
          },
          {
            name: '📊 **Current Status**',
            value: `\`${statBar}\`\n**${amount.toLocaleString()}** / **${statMax.toLocaleString()}** ${statName.toLowerCase()}`,
            inline: true
          }
        );

      // Add capacity information
      const capacityInfo = stat === 'health'
        ? `**Base Capacity:** ${MAX_H}\n**Current Capacity:** ${statMax}${targetIsPremium ? '\n**Premium Bonus:** +50%' : ''}`
        : `**Base Capacity:** ${MAX_S}\n**Current Capacity:** ${statMax}`;

      embed.addFields({
        name: '📈 **Capacity Details**',
        value: capacityInfo,
        inline: false
      });

      // Add administrative details
      embed.addFields(
        {
          name: '📝 **Modification Reason**',
          value: reason,
          inline: false
        },
        {
          name: '🛡️ **Administrative Details**',
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Stat Modification`,
          inline: true
        },
        {
          name: '⏰ **Timestamp**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      // Add warnings or notes
      if (amount > statMax) {
        embed.addFields({
          name: '⚠️ **Override Notice**',
          value: `🚨 Value exceeds normal maximum (${statMax})\n⚡ Staff/Developer override applied`,
          inline: false
        });
      } else if (amount < 10) {
        embed.addFields({
          name: '🔋 **Low Value Warning**',
          value: `⚠️ ${statName} set to critically low value\n💡 User may need immediate attention`,
          inline: false
        });
      }

      embed.setFooter({
        text: `🛡️ Staff Action Logged • QuestCord Admin Tools`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Setstats command error:', error);
      logger.error('setstats error: %s', error.message);

      await interaction.reply({
        content: `${userPrefix} ❌ An error occurred while updating the user stats. Please try again.`,
        ephemeral: true
      });
    }
  },
};