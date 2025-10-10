const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logCommand } = require('../utils/store_sqlite');

// Only allow bot owner to use deployment commands
const OWNER_ID = process.env.BOT_OWNER_ID || '378501056008683530';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deploy')
    .setDescription('🚀 Deployment management commands (Owner Only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check deployment status and available backups')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('backup')
        .setDescription('Create a manual backup of production')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('deploy')
        .setDescription('Deploy development changes to production')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rollback')
        .setDescription('Rollback to a previous backup')
        .addStringOption(option =>
          option.setName('backup_id')
            .setDescription('Backup ID to rollback to (use /deploy status to see available backups)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('restart')
        .setDescription('Restart the production server')
    ),

  async execute(interaction, ctx) {
    // Owner-only check
    if (interaction.user.id !== OWNER_ID) {
      const embed = new EmbedBuilder()
        .setTitle('❌ **Access Denied**')
        .setDescription('This command can only be used by the bot owner.')
        .setColor(0xFF0000)
        .setTimestamp();
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `deploy ${subcommand}`, interaction.guild?.id);

    try {
      switch (subcommand) {
        case 'status':
          await this.handleStatus(interaction);
          break;
        case 'backup':
          await this.handleBackup(interaction);
          break;
        case 'deploy':
          await this.handleDeploy(interaction);
          break;
        case 'rollback':
          await this.handleRollback(interaction);
          break;
        case 'restart':
          await this.handleRestart(interaction);
          break;
      }
    } catch (error) {
      console.error('[Deploy Command] Error:', error);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ **Command Failed**')
        .setDescription(`An error occurred: ${error.message}`)
        .setColor(0xFF0000)
        .setTimestamp();
      
      if (interaction.replied) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },

  async handleStatus(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Get current environment info
    const currentEnv = process.env.NODE_ENV || 'production';
    const port = process.env.PORT || 80;
    
    // Get backup information
    const backupDir = path.join(process.cwd(), 'backups');
    let backups = [];
    
    if (fs.existsSync(backupDir)) {
      backups = fs.readdirSync(backupDir)
        .filter(name => name.startsWith('deploy_'))
        .slice(0, 5) // Show only last 5 backups
        .map(name => {
          const manifestPath = path.join(backupDir, name, 'manifest.json');
          let timestamp = 'unknown';
          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              timestamp = new Date(manifest.timestamp).toLocaleString();
            } catch (e) {
              // Ignore
            }
          }
          return `\`${name}\` - ${timestamp}`;
        });
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 **Deployment Status**')
      .setColor(0x00FF00)
      .addFields(
        {
          name: '🌐 Current Environment',
          value: `**Environment**: ${currentEnv}\n**Port**: ${port}\n**Process**: ${process.pid}`,
          inline: true
        },
        {
          name: '📦 Database Status',
          value: this.getDatabaseInfo(),
          inline: true
        },
        {
          name: '💾 Recent Backups',
          value: backups.length > 0 ? backups.join('\n') : 'No backups found',
          inline: false
        }
      )
      .setFooter({ text: 'Use /deploy backup to create a new backup' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async handleBackup(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('💾 **Creating Backup...**')
      .setDescription('Please wait while I create a backup of the production environment.')
      .setColor(0xFFFF00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    try {
      // Execute backup creation
      const backupId = `deploy_${Date.now()}`;
      const result = execSync('node scripts/deploy.js --backup-only', { 
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 60000 
      });

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ **Backup Created Successfully**')
        .setDescription(`Backup has been created and stored safely.`)
        .addFields({
          name: '📁 Backup Details',
          value: `**ID**: \`${backupId}\`\n**Time**: ${new Date().toLocaleString()}\n**Status**: Complete`,
          inline: false
        })
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ **Backup Failed**')
        .setDescription(`Failed to create backup: ${error.message}`)
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleDeploy(interaction) {
    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('deploy_confirm')
      .setLabel('✅ Deploy to Production')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId('deploy_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ **Production Deployment**')
      .setDescription(`You are about to deploy development changes to production!`)
      .addFields(
        {
          name: '🔄 What will happen:',
          value: '• Backup current production data\n• Deploy database changes\n• Update configuration\n• Validate deployment\n• Service restart required',
          inline: false
        },
        {
          name: '⚠️ Important:',
          value: '• This will affect live users\n• Make sure you tested in development\n• Backup will be created automatically',
          inline: false
        }
      )
      .setColor(0xFF8000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    // Handle button interactions
    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ 
      filter, 
      time: 60000, 
      max: 1 
    });

    collector.on('collect', async i => {
      if (i.customId === 'deploy_confirm') {
        await this.executeDeploy(i);
      } else {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ **Deployment Cancelled**')
          .setDescription('Production deployment was cancelled.')
          .setColor(0x808080)
          .setTimestamp();

        await i.update({ embeds: [cancelEmbed], components: [] });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        // Timeout - disable buttons
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ **Deployment Timeout**')
          .setDescription('Deployment confirmation timed out. Please try again.')
          .setColor(0x808080)
          .setTimestamp();

        interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
      }
    });
  },

  async executeDeploy(interaction) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚀 **Deploying to Production...**')
          .setDescription('Deployment in progress. This may take a few minutes.')
          .setColor(0xFFFF00)
          .setTimestamp()
      ],
      components: []
    });

    try {
      const result = execSync('node scripts/deploy.js', { 
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 180000 // 3 minutes
      });

      const successEmbed = new EmbedBuilder()
        .setTitle('🎉 **Deployment Successful!**')
        .setDescription('Your development changes have been deployed to production.')
        .addFields({
          name: '✅ Next Steps:',
          value: '• Production server needs restart\n• Test your live server\n• Monitor for any issues\n• Rollback available if needed',
          inline: false
        })
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ **Deployment Failed**')
        .setDescription(`Deployment failed with error: ${error.message}`)
        .addFields({
          name: '🔧 What to do:',
          value: '• Check the server logs\n• Fix any issues\n• Try deployment again\n• Use rollback if needed',
          inline: false
        })
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRollback(interaction) {
    const backupId = interaction.options.getString('backup_id');
    
    // If no backup specified, show available backups
    if (!backupId) {
      await this.showAvailableBackups(interaction);
      return;
    }

    // Confirm rollback
    const confirmButton = new ButtonBuilder()
      .setCustomId('rollback_confirm')
      .setLabel('✅ Rollback')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId('rollback_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ **Confirm Rollback**')
      .setDescription(`You are about to rollback to: \`${backupId}\``)
      .addFields({
        name: '🔄 What will happen:',
        value: '• Replace current production database\n• Restore previous configuration\n• Current data will be backed up\n• Service restart required',
        inline: false
      })
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    // Handle confirmation
    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ 
      filter, 
      time: 60000, 
      max: 1 
    });

    collector.on('collect', async i => {
      if (i.customId === 'rollback_confirm') {
        await this.executeRollback(i, backupId);
      } else {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ **Rollback Cancelled**')
          .setDescription('Rollback was cancelled.')
          .setColor(0x808080)
          .setTimestamp();

        await i.update({ embeds: [cancelEmbed], components: [] });
      }
    });
  },

  async executeRollback(interaction, backupId) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔄 **Rolling Back...**')
          .setDescription(`Rolling back to backup: \`${backupId}\``)
          .setColor(0xFFFF00)
          .setTimestamp()
      ],
      components: []
    });

    try {
      const result = execSync(`node scripts/rollback.js ${backupId}`, { 
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 120000
      });

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ **Rollback Complete**')
        .setDescription(`Successfully rolled back to: \`${backupId}\``)
        .addFields({
          name: '🔄 Next Steps:',
          value: '• Restart production server\n• Test functionality\n• Monitor for issues',
          inline: false
        })
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ **Rollback Failed**')
        .setDescription(`Rollback failed: ${error.message}`)
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async showAvailableBackups(interaction) {
    const backupDir = path.join(process.cwd(), 'backups');
    let backups = [];
    
    if (fs.existsSync(backupDir)) {
      backups = fs.readdirSync(backupDir)
        .filter(name => name.startsWith('deploy_'))
        .slice(0, 10);
    }

    const embed = new EmbedBuilder()
      .setTitle('💾 **Available Backups**')
      .setDescription(backups.length > 0 
        ? `Use \`/deploy rollback backup_id:<backup_id>\` to rollback\n\n${backups.map(b => `\`${b}\``).join('\n')}`
        : 'No backups available'
      )
      .setColor(0x0099FF)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleRestart(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🔄 **Server Restart**')
      .setDescription('Production server restart initiated via Discord command.')
      .addFields({
        name: '📝 Manual Steps Required:',
        value: '• Stop current production process\n• Run: `npm run start:prod`\n• Verify server is running',
        inline: false
      })
      .setColor(0xFF8000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  getDatabaseInfo() {
    try {
      const dbPath = path.join(process.cwd(), 'data.sqlite');
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        return `**Size**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n**Modified**: ${stats.mtime.toLocaleDateString()}`;
      } else {
        return '**Status**: Database not found';
      }
    } catch (error) {
      return '**Status**: Error reading database info';
    }
  }
};