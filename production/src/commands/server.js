const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { isStaffOrDev, getUserPrefix } = require('../utils/roles');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Server tools (staff/dev)')
    .addSubcommand(sc=>sc.setName('archive').setDescription('Soft-delete (archive) a server')
      .addStringOption(o=>o.setName('guildid').setDescription('Guild ID').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(sc=>sc.setName('restore').setDescription('Restore an archived server')
      .addStringOption(o=>o.setName('guildid').setDescription('Guild ID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('list').setDescription('List archived servers')),
  async execute(interaction){
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (!(await isStaffOrDev(interaction.client, interaction.user.id))) return interaction.reply({ content: `${userPrefix} Staff/Developer only.`, ephemeral: true });
    const sub = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `server ${sub}`, interaction.guild?.id);
    if (sub === 'archive'){
      const gid = interaction.options.getString('guildid');
      const reason = interaction.options.getString('reason') || null;
      
      // Check if server exists
      const serverExists = db.prepare('SELECT name FROM servers WHERE guildId=? AND archived=0').get(gid);
      if (!serverExists) {
        const notFoundEmbed = new EmbedBuilder()
          .setTitle('❌🏛️ **SERVER NOT FOUND** 🏛️❌')
          .setDescription('The specified server could not be found or is already archived')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix} - Server Manager`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields({
            name: '🔍 **Server ID**',
            value: `\`${gid}\`\nNot found in active servers`,
            inline: false
          })
          .setFooter({ 
            text: `Use /server list to see archived servers • QuestCord Admin`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
      }

      db.prepare('UPDATE servers SET archived=1, archivedAt=?, archivedBy=? WHERE guildId=?').run(Date.now(), interaction.user.id, gid);
      logger.info('server_archive: %s archived %s reason=%s', interaction.user.id, gid, reason);
      
      const archiveEmbed = new EmbedBuilder()
        .setTitle('🗄️⚠️ **SERVER ARCHIVED** ⚠️🗄️')
        .setDescription('The server has been archived and removed from active rotation')
        .setColor(0xFF8C00)
        .setAuthor({ 
          name: `${userPrefix} - Archive Manager`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '🏛️ **Archived Server**',
            value: `**${serverExists.name || 'Unknown'}**\n🆔 ${gid}`,
            inline: true
          },
          {
            name: '👤 **Archived By**',
            value: `<@${interaction.user.id}>\n🕐 ${new Date().toLocaleString()}`,
            inline: true
          },
          {
            name: '📝 **Reason**',
            value: reason || '_No reason provided_',
            inline: true
          },
          {
            name: '⚠️ **Effects**',
            value: '• Server removed from discovery\n• Travel disabled to this location\n• Data preserved for restoration\n• Use `/server restore` to reactivate',
            inline: false
          }
        )
        .setFooter({ 
          text: `Archive operation completed • QuestCord Server Management`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [archiveEmbed] });
    }
    
    if (sub === 'restore'){
      const gid = interaction.options.getString('guildid');
      
      // Check if server exists in archives
      const archivedServer = db.prepare('SELECT name, archivedAt, archivedBy FROM servers WHERE guildId=? AND archived=1').get(gid);
      if (!archivedServer) {
        const notFoundEmbed = new EmbedBuilder()
          .setTitle('❌📁 **ARCHIVED SERVER NOT FOUND** 📁❌')
          .setDescription('The specified server is not in the archive')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix} - Restore Manager`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields({
            name: '🔍 **Server ID**',
            value: `\`${gid}\`\nNot found in archives`,
            inline: false
          })
          .setFooter({ 
            text: `Use /server list to see available archives • QuestCord Admin`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
      }

      db.prepare('UPDATE servers SET archived=0, archivedAt=NULL, archivedBy=NULL WHERE guildId=?').run(gid);
      logger.info('server_restore: %s restored %s', interaction.user.id, gid);
      
      const restoreEmbed = new EmbedBuilder()
        .setTitle('✅🔄 **SERVER RESTORED** 🔄✅')
        .setDescription('The server has been successfully restored from archives')
        .setColor(0x00D26A)
        .setAuthor({ 
          name: `${userPrefix} - Restoration Manager`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '🏛️ **Restored Server**',
            value: `**${archivedServer.name || 'Unknown'}**\n🆔 ${gid}`,
            inline: true
          },
          {
            name: '🔄 **Restored By**',
            value: `<@${interaction.user.id}>\n🕐 ${new Date().toLocaleString()}`,
            inline: true
          },
          {
            name: '📊 **Archive Duration**',
            value: `${Math.round((Date.now() - archivedServer.archivedAt) / (1000 * 60 * 60 * 24))} days\nArchived by <@${archivedServer.archivedBy}>`,
            inline: true
          },
          {
            name: '✨ **Restoration Effects**',
            value: '• Server returned to active status\n• Travel enabled to this location\n• Discoverable in server lists\n• Full functionality restored',
            inline: false
          }
        )
        .setFooter({ 
          text: `Server restoration completed • QuestCord Server Management`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [restoreEmbed] });
    }
    
    if (sub === 'list'){
      const rows = db.prepare('SELECT guildId, name, archivedAt, archivedBy FROM servers WHERE archived=1 ORDER BY archivedAt DESC').all();
      
      if (!rows.length) {
        const noArchivesEmbed = new EmbedBuilder()
          .setTitle('📁✅ **NO ARCHIVED SERVERS** ✅📁')
          .setDescription('All servers are currently active')
          .setColor(0x00AE86)
          .setAuthor({ 
            name: `${userPrefix} - Archive Manager`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields({
            name: '🏛️ **Server Status**',
            value: '• All servers are active\n• No servers in archive\n• System operating normally',
            inline: false
          })
          .setFooter({ 
            text: `Archive system healthy • QuestCord Server Management`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        return interaction.reply({ embeds: [noArchivesEmbed] });
      }

      const archiveEmbed = new EmbedBuilder()
        .setTitle('🗄️📁 **ARCHIVED SERVERS** 📁🗄️')
        .setDescription(`📊 *${rows.length} server${rows.length !== 1 ? 's' : ''} currently in archive* 🗃️`)
        .setColor(0xFF8C00)
        .setAuthor({ 
          name: `${userPrefix} - Archive Manager`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields({
          name: '📊 **Archive Statistics**',
          value: `• **${rows.length}** total archived servers\n• Oldest: ${new Date(Math.min(...rows.map(r => r.archivedAt))).toLocaleDateString()}\n• Most recent: ${new Date(Math.max(...rows.map(r => r.archivedAt))).toLocaleDateString()}`,
          inline: false
        });

      // Split servers into chunks to avoid embed limits
      const chunkSize = 10;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const serverList = chunk.map((r, idx) => {
          const archiveAge = Math.round((Date.now() - r.archivedAt) / (1000 * 60 * 60 * 24));
          return `**${i + idx + 1}.** ${r.name || 'Unknown'}\n└ ID: \`${r.guildId}\`\n└ Archived: ${archiveAge} days ago by <@${r.archivedBy}>`;
        }).join('\n\n');

        archiveEmbed.addFields({
          name: i === 0 ? '🗃️ **Archived Servers**' : `📁 **More Archives (${i + 1}-${Math.min(i + chunkSize, rows.length)})**`,
          value: serverList,
          inline: false
        });
      }

      archiveEmbed
        .setFooter({ 
          text: `Use /server restore <id> to reactivate • QuestCord Archive`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [archiveEmbed] });
    }
  }
};
