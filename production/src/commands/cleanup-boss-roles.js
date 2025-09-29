const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { cleanupOrphanedBossFighterRoles } = require('../utils/boss_spawner');
const { db, logCommand } = require('../utils/store_sqlite');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cleanup-boss-roles')
    .setDescription('Clean up orphaned boss fighter roles and participation records')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Log command usage for live activity tracking
      logCommand(interaction.user.id, 'cleanup-boss-roles', interaction.guild?.id);

      // Check if user is staff or developer
      const userId = interaction.user.id;
      const player = db.prepare('SELECT * FROM players WHERE userId = ?').get(userId);
      
      if (!player || (player.roleLevel !== 'Staff' && player.roleLevel !== 'Developer')) {
        return interaction.editReply({
          content: '❌ This command requires Staff or Developer permissions.',
          ephemeral: true
        });
      }

      // Clean up orphaned database records first
      const orphanedParticipations = db.prepare(`
        SELECT bp.*, b.guildId, b.active, b.expiresAt, b.name as bossName 
        FROM boss_participants bp 
        LEFT JOIN bosses b ON bp.bossId = b.id 
        WHERE b.active = 0 OR b.expiresAt < ?
      `).all(Date.now());

      let cleanupMessage = `🔧 **Boss Role Cleanup Report**\n\n`;

      if (orphanedParticipations.length > 0) {
        // Delete orphaned participations
        const deleteStmt = db.prepare(`
          DELETE FROM boss_participants 
          WHERE bossId IN (
            SELECT id FROM bosses 
            WHERE active = 0 OR expiresAt < ?
          )
        `);
        
        const result = deleteStmt.run(Date.now());
        
        cleanupMessage += `📊 **Database Cleanup:**\n`;
        cleanupMessage += `• Found ${orphanedParticipations.length} orphaned boss participation records\n`;
        cleanupMessage += `• Deleted ${result.changes} orphaned participation records\n\n`;
        
        const affectedUsers = [...new Set(orphanedParticipations.map(p => p.userId))];
        cleanupMessage += `👥 **Affected Users:** ${affectedUsers.length} users\n`;
        cleanupMessage += affectedUsers.map(userId => `• <@${userId}>`).join('\n') + '\n\n';
      } else {
        cleanupMessage += `✅ **Database:** No orphaned participation records found\n\n`;
      }

      // Clean up Discord roles
      cleanupMessage += `🤖 **Discord Role Cleanup:**\n`;
      cleanupMessage += `• Running Discord role cleanup...\n`;
      
      try {
        await cleanupOrphanedBossFighterRoles(interaction.client);
        cleanupMessage += `• ✅ Discord role cleanup completed successfully\n`;
      } catch (error) {
        cleanupMessage += `• ❌ Discord role cleanup failed: ${error.message}\n`;
        logger.error('Manual boss role cleanup failed:', error);
      }

      cleanupMessage += `\n✅ **Cleanup completed!**`;

      await interaction.editReply({
        content: cleanupMessage,
        ephemeral: true
      });

      logger.info(`Manual boss role cleanup executed by ${interaction.user.tag} (${userId})`);

    } catch (error) {
      logger.error('Error in cleanup-boss-roles command:', error);
      
      const errorMessage = 'An error occurred while cleaning up boss roles. Check logs for details.';
      
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};