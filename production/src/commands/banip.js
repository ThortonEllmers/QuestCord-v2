const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { isStaffOrDev, getUserPrefix } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banip')
    .setDescription('🔨 IP address ban management system (Staff/Developer only)')
    .addSubcommand(sc => sc
      .setName('add')
      .setDescription('🚫 Ban an IP address from using the bot and website')
      .addStringOption(o => o
        .setName('ip')
        .setDescription('🌐 IP address to ban (e.g., 192.168.1.1)')
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
      .setDescription('✅ Unban an IP address')
      .addStringOption(o => o
        .setName('ip')
        .setDescription('🌐 IP address to unban')
        .setRequired(true)))
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('📋 List all current IP bans'))
    .addSubcommand(sc => sc
      .setName('check')
      .setDescription('🔍 Check if an IP address is banned')
      .addStringOption(o => o
        .setName('ip')
        .setDescription('🌐 IP address to check')
        .setRequired(true))),

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
    logCommand(interaction, `banip ${sub}`, interaction.guild?.id);
    const adminRole = await fetchRoleLevel(interaction.user.id);

    if (sub === 'add') {
      const ip = interaction.options.getString('ip');
      const reason = interaction.options.getString('reason');
      const minutes = interaction.options.getInteger('minutes');
      const exp = minutes > 0 ? Date.now() + minutes * 60000 : null;

      // Validate IP address format (basic validation)
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ip)) {
        return interaction.reply({
          content: `${userPrefix} ❌ Invalid IP address format. Please use format: xxx.xxx.xxx.xxx`,
          ephemeral: true
        });
      }

      // Check if IP is already banned
      const existingBan = db.prepare('SELECT * FROM ip_bans WHERE ip=?').get(ip);

      // Insert or update ban
      db.prepare(`
        INSERT OR REPLACE INTO ip_bans(ip, reason, bannedBy, bannedAt, expiresAt)
        VALUES(?,?,?,?,?)
      `).run(ip, reason, interaction.user.id, Date.now(), exp);

      logger.info('banip_add: %s banned IP %s for %s minutes', interaction.user.id, ip, minutes);

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
        .setTitle('🔨🚫 **IP ADDRESS BANNED** 🚫🔨')
        .setDescription(`🌐 *Global IP ban applied - Cannot access bot or website* ⚡`)
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - IP Ban System`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '🌐 **Banned IP Address**',
            value: `\`${ip}\`${existingBan ? '\n⚠️ *Previously banned*' : ''}`,
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
        text: `🛡️ Moderation Action Logged • QuestCord IP Ban System`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const ip = interaction.options.getString('ip');

      // Check if IP is actually banned
      const existingBan = db.prepare('SELECT * FROM ip_bans WHERE ip=?').get(ip);
      if (!existingBan) {
        return interaction.reply({
          content: `${userPrefix} ❌ IP address **${ip}** is not currently banned.`,
          ephemeral: true
        });
      }

      // Remove ban
      db.prepare('DELETE FROM ip_bans WHERE ip=?').run(ip);
      logger.info('banip_remove: %s unbanned IP %s', interaction.user.id, ip);

      const embed = new EmbedBuilder()
        .setTitle('✅🔓 **IP ADDRESS UNBANNED** 🔓✅')
        .setDescription(`🎉 *IP ban removed - Can now access bot and website* ⚡`)
        .setColor(0x2ECC71)
        .setAuthor({
          name: `${userPrefix} - IP Ban System`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '✅ **Unbanned IP Address**',
            value: `\`${ip}\``,
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
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** IP Ban Removal`,
          inline: true
        },
        {
          name: '📅 **Timestamp**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      embed.setFooter({
        text: `🛡️ Moderation Action Logged • QuestCord IP Ban System`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'check') {
      const ip = interaction.options.getString('ip');

      // Check if IP is banned
      const ban = db.prepare('SELECT * FROM ip_bans WHERE ip=?').get(ip);

      if (!ban) {
        const embed = new EmbedBuilder()
          .setTitle('✅ **IP ADDRESS NOT BANNED** ✅')
          .setDescription(`🎉 *This IP address is not banned* ⚡`)
          .setColor(0x2ECC71)
          .addFields({
            name: '🌐 **Checked IP Address**',
            value: `\`${ip}\`\n**Status:** Not banned`,
            inline: false
          })
          .setFooter({
            text: `QuestCord IP Ban System`,
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Check if ban is expired
      const isExpired = ban.expiresAt && ban.expiresAt <= Date.now();

      const embed = new EmbedBuilder()
        .setTitle(isExpired ? '⚠️ **IP BAN EXPIRED** ⚠️' : '🚫 **IP ADDRESS BANNED** 🚫')
        .setDescription(isExpired ?
          `⏰ *This IP ban has expired and should be cleaned up* ⚡` :
          `🚫 *This IP address is currently banned* ⚡`)
        .setColor(isExpired ? 0xF39C12 : 0xE74C3C)
        .addFields(
          {
            name: '🌐 **IP Address**',
            value: `\`${ip}\``,
            inline: true
          },
          {
            name: '📝 **Ban Reason**',
            value: ban.reason,
            inline: true
          },
          {
            name: '⏰ **Duration**',
            value: ban.expiresAt ?
              `**Expires:** <t:${Math.floor(ban.expiresAt / 1000)}:R>` :
              '**Permanent**',
            inline: true
          }
        );

      embed.addFields(
        {
          name: '🛡️ **Ban Details**',
          value: `**Banned By:** <@${ban.bannedBy}>\n**Banned At:** <t:${Math.floor(ban.bannedAt / 1000)}:F>`,
          inline: true
        }
      );

      if (ban.notes) {
        embed.addFields({
          name: '📌 **Notes**',
          value: ban.notes,
          inline: false
        });
      }

      embed.setFooter({
        text: `QuestCord IP Ban System`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'list') {
      const rows = db.prepare('SELECT * FROM ip_bans').all();

      if (!rows.length) {
        const embed = new EmbedBuilder()
          .setTitle('📋✅ **NO ACTIVE IP BANS** ✅📋')
          .setDescription('🎉 *No IP addresses are currently banned* ⚡')
          .setColor(0x2ECC71)
          .setAuthor({
            name: `${userPrefix} - IP Ban System`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .addFields({
            name: '📊 **Ban Statistics**',
            value: '**Active IP Bans:** 0\n**Total Banned IPs:** 0\n**Status:** All clear! 🎉',
            inline: false
          })
          .setFooter({
            text: `🛡️ QuestCord IP Ban System`,
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
        .setTitle('📋🔨 **IP BAN LIST** 🔨📋')
        .setDescription(`📊 *Current global IP ban status* ⚡`)
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - IP Ban System`,
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
          return `🔒 \`${r.ip}\` - ${r.reason}`;
        }).join('\n');

        embed.addFields({
          name: `🔒 **Permanent IP Bans** (${permanentBans.length})`,
          value: permanentList + (permanentBans.length > 10 ? `\n*... and ${permanentBans.length - 10} more*` : ''),
          inline: false
        });
      }

      // Show temporary bans
      if (activeBans.length > 0) {
        const temporaryList = activeBans.slice(0, 8).map(r => {
          return `⏰ \`${r.ip}\` - ${r.reason}\n   **Expires:** <t:${Math.floor(r.expiresAt / 1000)}:R>`;
        }).join('\n');

        embed.addFields({
          name: `⏰ **Temporary IP Bans** (${activeBans.length})`,
          value: temporaryList + (activeBans.length > 8 ? `\n*... and ${activeBans.length - 8} more*` : ''),
          inline: false
        });
      }

      // Show expired bans that need cleanup
      if (expiredBans.length > 0) {
        embed.addFields({
          name: '🗑️ **Cleanup Required**',
          value: `**${expiredBans.length}** expired temporary IP bans need removal\nThese IPs can already access the bot and website again`,
          inline: false
        });
      }

      embed.setFooter({
        text: `🛡️ QuestCord IP Ban System • Page 1`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
