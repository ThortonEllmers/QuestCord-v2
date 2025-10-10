const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { db } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boss-notifications')
    .setDescription('Configure boss spawn notifications for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up boss notifications for this server')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel to send boss notifications')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to ping for boss notifications (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable boss notifications for this server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check current boss notification settings')
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'setup':
          await this.handleSetup(interaction);
          break;
        case 'disable':
          await this.handleDisable(interaction);
          break;
        case 'status':
          await this.handleStatus(interaction);
          break;
      }
    } catch (error) {
      console.error('[boss-notifications] Error executing command:', error.message);

      const errorMessage = 'An error occurred while managing boss notifications. Please try again.';
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        return interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },

  async handleSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');

    // Validate channel
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: '❌ Please select a text channel for boss notifications.',
        ephemeral: true
      });
    }

    // Check bot permissions in the target channel
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
    const permissions = channel.permissionsFor(botMember);

    if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: `❌ I need **Send Messages** and **Embed Links** permissions in ${channel}.`,
        ephemeral: true
      });
    }

    try {
      // Update or insert notification settings
      const now = Date.now();
      db.prepare(`
        REPLACE INTO boss_notification_settings
        (guildId, channelId, enabled, roleId, enabledAt, updatedBy)
        VALUES (?, ?, 1, ?, ?, ?)
      `).run(
        interaction.guild.id,
        channel.id,
        role?.id || null,
        now,
        interaction.user.id
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Boss Notifications Configured')
        .setDescription('Boss spawn notifications have been set up for this server!')
        .setColor(0x00FF00)
        .addFields(
          {
            name: '📢 Notification Channel',
            value: `${channel}`,
            inline: true
          },
          {
            name: '🔔 Ping Role',
            value: role ? `${role}` : 'None',
            inline: true
          }
        )
        .setFooter({
          text: 'When bosses spawn in your server, you\'ll get notified here!',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[boss-notifications] Database error during setup:', error.message);
      return interaction.reply({
        content: '❌ Failed to save notification settings. Please try again.',
        ephemeral: true
      });
    }
  },

  async handleDisable(interaction) {
    try {
      const settings = db.prepare(`
        SELECT * FROM boss_notification_settings WHERE guildId = ?
      `).get(interaction.guild.id);

      if (!settings) {
        return interaction.reply({
          content: '❌ Boss notifications are not currently configured for this server.',
          ephemeral: true
        });
      }

      // Disable notifications
      const now = Date.now();
      db.prepare(`
        UPDATE boss_notification_settings
        SET enabled = 0, disabledAt = ?, updatedBy = ?
        WHERE guildId = ?
      `).run(now, interaction.user.id, interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('🔇 Boss Notifications Disabled')
        .setDescription('Boss spawn notifications have been disabled for this server.')
        .setColor(0xFF6B6B)
        .setFooter({
          text: 'You can re-enable them anytime with /boss-notifications setup',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[boss-notifications] Database error during disable:', error.message);
      return interaction.reply({
        content: '❌ Failed to disable notifications. Please try again.',
        ephemeral: true
      });
    }
  },

  async handleStatus(interaction) {
    try {
      const settings = db.prepare(`
        SELECT * FROM boss_notification_settings WHERE guildId = ?
      `).get(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('📊 Boss Notification Status')
        .setColor(0x5865F2)
        .setTimestamp();

      if (!settings || !settings.enabled) {
        embed
          .setDescription('❌ Boss notifications are **disabled** for this server.')
          .addFields({
            name: '💡 Setup Instructions',
            value: 'Use `/boss-notifications setup` to configure notifications for when bosses spawn in your server!',
            inline: false
          });
      } else {
        const channel = await interaction.client.channels.fetch(settings.channelId).catch(() => null);
        const role = settings.roleId ? await interaction.guild.roles.fetch(settings.roleId).catch(() => null) : null;

        embed
          .setDescription('✅ Boss notifications are **enabled** for this server.')
          .addFields(
            {
              name: '📢 Notification Channel',
              value: channel ? `${channel}` : `❌ Channel not found (${settings.channelId})`,
              inline: true
            },
            {
              name: '🔔 Ping Role',
              value: role ? `${role}` : settings.roleId ? `❌ Role not found` : 'None',
              inline: true
            },
            {
              name: '📅 Configured',
              value: `<t:${Math.floor(settings.enabledAt / 1000)}:R>`,
              inline: true
            }
          );
      }

      return interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[boss-notifications] Error checking status:', error.message);
      return interaction.reply({
        content: '❌ Failed to check notification status. Please try again.',
        ephemeral: true
      });
    }
  }
};