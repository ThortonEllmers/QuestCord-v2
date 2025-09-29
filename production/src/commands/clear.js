const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { isStaffOrDev, getUserPrefix, isPremium } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');
const { isBanned } = require('./_guard');
const { ensurePlayerWithVehicles } = require('../utils/players');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('🗑️ Clear user data with confirmation (Staff/Developer only)')
    .addSubcommand(sc => sc
      .setName('inventory')
      .setDescription('🎒 Clear a user\'s entire inventory')
      .addUserOption(o => o
        .setName('user')
        .setDescription('👤 User whose inventory to clear')
        .setRequired(true))
      .addBooleanOption(o => o
        .setName('confirm')
        .setDescription('⚠️ Confirm you want to clear ALL items (IRREVERSIBLE)')
        .setRequired(true)))
    .addSubcommand(sc => sc
      .setName('equipment')
      .setDescription('⚔️ Clear a user\'s equipped items')
      .addUserOption(o => o
        .setName('user')
        .setDescription('👤 User whose equipment to clear')
        .setRequired(true))
      .addBooleanOption(o => o
        .setName('confirm')
        .setDescription('⚠️ Confirm you want to clear ALL equipment (IRREVERSIBLE)')
        .setRequired(true))),

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    // Check ban status
    if (isBanned(interaction.user.id)) {
      return interaction.reply({
        content: `${userPrefix} ❌ You are banned from using this bot.`,
        ephemeral: true
      });
    }

    // Check staff permissions
    if (!(await isStaffOrDev(interaction.client, interaction.user.id))) {
      return interaction.reply({
        content: `${userPrefix} ❌ This command is only available to Staff and Developers.`,
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const confirm = interaction.options.getBoolean('confirm');
    const adminRole = await fetchRoleLevel(interaction.user.id);

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `clear ${subcommand}`, interaction.guild?.id);

    // Require explicit confirmation
    if (!confirm) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️🛑 **CONFIRMATION REQUIRED** 🛑⚠️')
        .setDescription('🔴 *This action requires explicit confirmation to prevent accidents*')
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Safety Check`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '🎯 **Target User**',
            value: `**${targetUser.displayName}**\n\`${targetUser.id}\``,
            inline: true
          },
          {
            name: '🗑️ **Action**',
            value: `Clear ${subcommand === 'inventory' ? '**ALL inventory items**' : '**ALL equipped items**'}`,
            inline: true
          },
          {
            name: '⚠️ **Warning**',
            value: '**IRREVERSIBLE ACTION**\nData cannot be recovered',
            inline: true
          }
        )
        .addFields({
          name: '✅ **To Proceed**',
          value: `Set the \`confirm\` option to \`True\` and run the command again.\n\n🔴 **This action cannot be undone!**`,
          inline: false
        })
        .setFooter({
          text: '🛡️ Safety First • QuestCord Admin Tools',
          iconURL: interaction.client.user.displayAvatarURL()
        });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'inventory') {
      // Get current inventory count and items for logging
      const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE userId=?').get(targetUser.id);
      const itemCount = inventoryCount?.count || 0;

      if (itemCount === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📭❌ **INVENTORY ALREADY EMPTY** ❌📭')
          .setDescription('No action needed - inventory is already cleared')
          .setColor(0x95A5A6)
          .setAuthor({
            name: `${userPrefix} - Inventory Status`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .addFields({
            name: '👤 **Target User**',
            value: `**${targetUser.displayName}**\nInventory is already empty`,
            inline: false
          })
          .setFooter({
            text: '📦 No items to clear • QuestCord Admin Tools',
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Get sample of items for the report (up to 10)
      const sampleItems = db.prepare('SELECT itemId, qty FROM inventory WHERE userId=? ORDER BY qty DESC LIMIT 10').all(targetUser.id);

      // Clear entire inventory
      const result = db.prepare('DELETE FROM inventory WHERE userId=?').run(targetUser.id);

      // Restore default vehicles based on user's role hierarchy
      const userIsPremium = await isPremium(interaction.client, targetUser.id);

      // Always give commercial plane
      db.prepare('INSERT OR REPLACE INTO inventory(userId, itemId, qty) VALUES(?, ?, 1)')
        .run(targetUser.id, 'plane');

      let restoredItems = ['🛩️ Commercial Plane'];

      // Give private jet to premium+ users (includes staff and developers)
      if (userIsPremium) {
        db.prepare('INSERT OR REPLACE INTO inventory(userId, itemId, qty) VALUES(?, ?, 1)')
          .run(targetUser.id, 'private_jet');
        restoredItems.push('✈️ Private Jet');
      }

      // Ensure they have proper equipment setup
      await ensurePlayerWithVehicles(interaction.client, targetUser.id, targetUser.username);

      logger.info('clear_inventory: staff %s cleared inventory for user %s (%d items), restored vehicles: %s',
        interaction.user.id, targetUser.id, itemCount, restoredItems.join(', '));

      const embed = new EmbedBuilder()
        .setTitle('🗑️✅ **INVENTORY CLEARED** ✅🗑️')
        .setDescription('🧹 *Complete inventory reset with vehicle restoration* ⚡')
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Inventory Management`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '👤 **Target User**',
            value: `**${targetUser.displayName}**\n\`${targetUser.id}\``,
            inline: true
          },
          {
            name: '🗑️ **Items Removed**',
            value: `**${itemCount.toLocaleString()}** items\nAll inventory cleared`,
            inline: true
          },
          {
            name: '🔄 **Items Restored**',
            value: restoredItems.join('\n'),
            inline: true
          }
        );

      // Show sample of cleared items
      if (sampleItems.length > 0) {
        const itemsList = sampleItems.map(item => `• ${item.itemId} × ${item.qty}`).join('\n');
        embed.addFields({
          name: '📦 **Sample Cleared Items**',
          value: itemsList + (itemCount > 10 ? `\n*...and ${itemCount - 10} more items*` : ''),
          inline: false
        });
      }

      embed.addFields(
        {
          name: '🛡️ **Administrative Details**',
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Inventory Clear`,
          inline: true
        },
        {
          name: '⏰ **Timestamp**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      embed.setFooter({
        text: '🛡️ Major Action Logged • QuestCord Admin Tools',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'equipment') {
      // Get current equipment count for logging
      const equipmentCount = db.prepare('SELECT COUNT(*) as count FROM equipment WHERE userId=?').get(targetUser.id);
      const equipCount = equipmentCount?.count || 0;

      if (equipCount === 0) {
        const embed = new EmbedBuilder()
          .setTitle('⚔️❌ **NO EQUIPMENT FOUND** ❌⚔️')
          .setDescription('No action needed - user has no equipped items')
          .setColor(0x95A5A6)
          .setAuthor({
            name: `${userPrefix} - Equipment Status`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .addFields({
            name: '👤 **Target User**',
            value: `**${targetUser.displayName}**\nNo equipped items found`,
            inline: false
          })
          .setFooter({
            text: '⚔️ No equipment to clear • QuestCord Admin Tools',
            iconURL: interaction.client.user.displayAvatarURL()
          });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Get equipped items for the report
      const equippedItems = db.prepare('SELECT slot, itemId FROM equipment WHERE userId=?').all(targetUser.id);

      // Clear all equipment
      const result = db.prepare('DELETE FROM equipment WHERE userId=?').run(targetUser.id);

      // Reset vehicle to default plane
      db.prepare('UPDATE players SET vehicle=? WHERE userId=?').run('plane', targetUser.id);

      logger.info('clear_equipment: staff %s cleared equipment for user %s (%d items)',
        interaction.user.id, targetUser.id, equipCount);

      const embed = new EmbedBuilder()
        .setTitle('⚔️🗑️ **EQUIPMENT CLEARED** 🗑️⚔️')
        .setDescription('🛡️ *All equipped items removed and vehicle reset* ⚡')
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Equipment Management`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '👤 **Target User**',
            value: `**${targetUser.displayName}**\n\`${targetUser.id}\``,
            inline: true
          },
          {
            name: '⚔️ **Items Unequipped**',
            value: `**${equipCount}** equipped items\nAll slots cleared`,
            inline: true
          },
          {
            name: '🚗 **Vehicle Reset**',
            value: '🛩️ **Commercial Plane**\nDefault vehicle restored',
            inline: true
          }
        );

      // Show cleared equipment
      if (equippedItems.length > 0) {
        const equipmentList = equippedItems.map(item => {
          const slotIcon = {
            'weapon': '⚔️',
            'armor': '🛡️',
            'accessory': '💍',
            'tool': '🔧'
          }[item.slot] || '📦';

          return `${slotIcon} **${item.slot}:** ${item.itemId}`;
        }).join('\n');

        embed.addFields({
          name: '🎒 **Cleared Equipment**',
          value: equipmentList,
          inline: false
        });
      }

      embed.addFields(
        {
          name: '🛡️ **Administrative Details**',
          value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Equipment Clear`,
          inline: true
        },
        {
          name: '⏰ **Timestamp**',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );

      embed.setFooter({
        text: '🛡️ Equipment Action Logged • QuestCord Admin Tools',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};