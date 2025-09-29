const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { isStaffOrDev, getUserPrefix } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Global ban management system (Staff/Developer only)')
    .addSubcommand(sc => sc
      .setName('add')
      .setDescription('🚫 Ban a user from using the bot')
      .addUserOption(o => o
        .setName('user')
        .setDescription('👤 User to ban')
        .setRequired(true))
      .addStringOption(o => o
        .setName('reason')
        .setDescription('📝 Reason for the ban')
        .setRequired(true))
      .addIntegerOption(o => o
        .setName('minutes')
        .setDescription('⏱️ Duration in minutes (0 = permanent)')
        .setRequired(true)
        .setMinValue(0)))
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('✅ Unban a user')
      .addUserOption(o => o
        .setName('user')
        .setDescription('👤 User to unban')
        .setRequired(true)))
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('📋 List all current bans')),

  async execute(interaction){
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    // Check staff permissions
    if (!(await isStaffOrDev(interaction.client, interaction.user.id))) {
      return interaction.reply({
        content: `${userPrefix} ❌ This command is only available to Staff and Developers.`,
        ephemeral: true
      });
    }

    const sub = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `ban ${sub}`, interaction.guild?.id);
    const adminRole = await fetchRoleLevel(interaction.user.id);

    if (sub === 'add') {
      const u = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const minutes = interaction.options.getInteger('minutes');
      const exp = minutes > 0 ? Date.now() + minutes * 60000 : null;

      // Check if user is already banned
      const existingBan = db.prepare('SELECT * FROM bans WHERE userId=?').get(u.id);

      // Insert or update ban
      db.prepare('INSERT OR REPLACE INTO bans(userId, reason, expiresAt) VALUES(?,?,?)').run(u.id, reason, exp);
      logger.info('ban_add: %s banned %s for %s minutes', interaction.user.id, u.id, minutes);

      // Format duration
      let durationText;
      if (minutes === 0) {
        durationText = '**Permanent**';
      } else if (minutes < 60) {
        durationText = `**${minutes} minutes**`;
      } else if (minutes < 1440) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        durationText = remainingMinutes > 0 ? `**${hours}h ${remainingMinutes}m**` : `**${hours} hours**`;
      } else {
        const days = Math.floor(minutes / 1440);
        const remainingHours = Math.floor((minutes % 1440) / 60);
        durationText = remainingHours > 0 ? `**${days}d ${remainingHours}h**` : `**${days} days**`;
      }

      const embed = new EmbedBuilder()
        .setTitle('🔨❌ **USER BANNED** ❌🔨')
        .setDescription(`🚫 *Global ban applied - User cannot use bot features* ⚡`)
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Moderation Tools`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '🚫 **Banned User**',
            value: `**${u.displayName}**\n\`${u.id}\`${existingBan ? '\n⚠️ *Previously banned*' : ''}`,
            inline: true
          },
          {
            name: '⏱️ **Ban Duration**',
            value: `${durationText}\n${exp ? `**Expires:** <t:${Math.floor(exp / 1000)}:F>` : '**Expires:** Never'}`,
            inline: true
          },
          {
            name: '📊 **Ban Status**',
            value: exp ? `⏰ **Temporary**\n${durationText}` : '🔒 **Permanent**\nNo expiration',
            inline: true
          }
        );

      embed.addFields({
        name: '📝 **Ban Reason**',
        value: reason,
        inline: false
      });

      // Add expiration details for temporary bans
      if (exp) {
        embed.addFields({
          name: '⏰ **Expiration Details**',
          value: `**Expires:** <t:${Math.floor(exp / 1000)}:R>\n**Full Date:** <t:${Math.floor(exp / 1000)}:F>\n**Auto-unban:** Yes`,
          inline: false
        });
      }

      embed.addFields(
        {
          name: '🛡️ **Administrative Details**',
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** ${existingBan ? 'Ban Updated' : 'New Ban'}`,
          inline: true
        },
        {
          name: '📅 **Timestamp**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      embed.setFooter({
        text: `🛡️ Moderation Action Logged • QuestCord Ban System`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const u = interaction.options.getUser('user');

      // Check if user is actually banned
      const existingBan = db.prepare('SELECT * FROM bans WHERE userId=?').get(u.id);
      if (!existingBan) {
        return interaction.reply({
          content: `${userPrefix} ❌ **${u.displayName}** is not currently banned.`,
          ephemeral: true
        });
      }

      // Remove ban
      db.prepare('DELETE FROM bans WHERE userId=?').run(u.id);
      logger.info('ban_remove: %s unbanned %s', interaction.user.id, u.id);

      const embed = new EmbedBuilder()
        .setTitle('✅🔓 **USER UNBANNED** 🔓✅')
        .setDescription(`🎉 *Global ban removed - User can now use bot features* ⚡`)
        .setColor(0x2ECC71)
        .setAuthor({
          name: `${userPrefix} - Moderation Tools`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '✅ **Unbanned User**',
            value: `**${u.displayName}**\n\`${u.id}\``,
            inline: true
          },
          {
            name: '📝 **Previous Ban Reason**',
            value: existingBan.reason,
            inline: true
          },
          {
            name: '⏰ **Previous Duration**',
            value: existingBan.expiresAt ?
              `**Was:** Temporary\n**Expired:** <t:${Math.floor(existingBan.expiresAt / 1000)}:R>` :
              '**Was:** Permanent',
            inline: true
          }
        );

      embed.addFields(
        {
          name: '🛡️ **Administrative Details**',
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Ban Removal`,
          inline: true
        },
        {
          name: '📅 **Timestamp**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      embed.setFooter({
        text: `🛡️ Moderation Action Logged • QuestCord Ban System`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const rows = db.prepare('SELECT * FROM bans').all();

      if (!rows.length) {
        const embed = new EmbedBuilder()
          .setTitle('📋✅ **NO ACTIVE BANS** ✅📋')
          .setDescription('🎉 *No users are currently banned from using the bot* ⚡')
          .setColor(0x2ECC71)
          .setAuthor({
            name: `${userPrefix} - Moderation Tools`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .addFields({
            name: '📊 **Ban Statistics**',
            value: '**Active Bans:** 0\n**Total Banned Users:** 0\n**Status:** All clear! 🎉',
            inline: false
          })
          .setFooter({
            text: `🛡️ QuestCord Ban System`,
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [embed] });
      }

      // Separate permanent and temporary bans
      const permanentBans = rows.filter(r => !r.expiresAt);
      const temporaryBans = rows.filter(r => r.expiresAt);
      const expiredBans = temporaryBans.filter(r => r.expiresAt <= Date.now());
      const activeBans = temporaryBans.filter(r => r.expiresAt > Date.now());

      const embed = new EmbedBuilder()
        .setTitle('📋🔨 **BAN LIST** 🔨📋')
        .setDescription(`📊 *Current global ban status for all users* ⚡`)
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Moderation Tools`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields({
          name: '📊 **Summary**',
          value: `**Total Bans:** ${rows.length}\n**Permanent:** ${permanentBans.length}\n**Temporary:** ${activeBans.length}\n**Expired (Cleanup Needed):** ${expiredBans.length}`,
          inline: false
        });

      // Show permanent bans
      if (permanentBans.length > 0) {
        const permanentList = permanentBans.slice(0, 10).map(r => {
          return `🔒 <@${r.userId}> - ${r.reason}`;
        }).join('\n');

        embed.addFields({
          name: `🔒 **Permanent Bans** (${permanentBans.length})`,
          value: permanentList + (permanentBans.length > 10 ? `\n*... and ${permanentBans.length - 10} more*` : ''),
          inline: false
        });
      }

      // Show temporary bans
      if (activeBans.length > 0) {
        const temporaryList = activeBans.slice(0, 8).map(r => {
          return `⏰ <@${r.userId}> - ${r.reason}\n   **Expires:** <t:${Math.floor(r.expiresAt / 1000)}:R>`;
        }).join('\n');

        embed.addFields({
          name: `⏰ **Temporary Bans** (${activeBans.length})`,
          value: temporaryList + (activeBans.length > 8 ? `\n*... and ${activeBans.length - 8} more*` : ''),
          inline: false
        });
      }

      // Show expired bans that need cleanup
      if (expiredBans.length > 0) {
        embed.addFields({
          name: '🗑️ **Cleanup Required**',
          value: `**${expiredBans.length}** expired temporary bans need removal\nThese users can already use the bot again`,
          inline: false
        });
      }

      embed.setFooter({
        text: `🛡️ QuestCord Ban System • Page 1`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
