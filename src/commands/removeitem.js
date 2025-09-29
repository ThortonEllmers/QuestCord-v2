const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');
const { isStaffOrDev, getUserPrefix } = require('../utils/roles');
const { fetchRoleLevel } = require('../web/util');
const logger = require('../utils/logger');

function findItemByIdOrName(q){
  const items = config.items || [];
  return items.find(i => i.id === q) || items.find(i => i.name.toLowerCase() === q.toLowerCase());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeitem')
    .setDescription('❌ Remove items from any user (Staff/Developer only)')
    .addUserOption(o => o
      .setName('user')
      .setDescription('👤 Target user to remove items from')
      .setRequired(true))
    .addStringOption(o => o
      .setName('item')
      .setDescription('🎒 Item to remove (use autocomplete)')
      .setAutocomplete(true)
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('amount')
      .setDescription('📊 Quantity to remove (minimum 1)')
      .setRequired(true)
      .setMinValue(1)),

  async autocomplete(interaction){
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'item') return;
    const q = String(focused.value||'').toLowerCase();
    const items = (config.items || []).filter(i =>
      i.id.includes(q) || i.name.toLowerCase().includes(q)
    ).slice(0, 25);
    await interaction.respond(items.map(i => ({
      name: `${i.name} (${i.rarity || 'common'}) - ${i.id}`,
      value: i.id
    })));
  },

  async execute(interaction){
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'removeitem', interaction.guild?.id);
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    // Check staff permissions
    if (!(await isStaffOrDev(interaction.client, interaction.user.id))) {
      return interaction.reply({
        content: `${userPrefix} ❌ This command is only available to Staff and Developers.`,
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const itemId = interaction.options.getString('item');
    const amount = Math.max(1, interaction.options.getInteger('amount'));
    const item = findItemByIdOrName(itemId);

    if (!item) {
      return interaction.reply({
        content: `${userPrefix} ❌ Unknown item. Please use the autocomplete dropdown to select a valid item.`,
        ephemeral: true
      });
    }

    // Check if user has enough of the item
    const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(target.id, item.id);
    if (!inv || inv.qty < amount) {
      const availableAmount = inv?.qty || 0;
      return interaction.reply({
        content: `${userPrefix} ❌ **${target.displayName}** only has **${availableAmount}x ${item.name}**. Cannot remove ${amount}.`,
        ephemeral: true
      });
    }

    // Get role level for logging
    const adminRole = await fetchRoleLevel(interaction.user.id);
    const previousAmount = inv.qty;
    const newTotal = previousAmount - amount;

    // Remove item from inventory
    db.prepare('UPDATE inventory SET qty=qty-? WHERE userId=? AND itemId=?').run(amount, target.id, item.id);
    db.prepare('DELETE FROM inventory WHERE userId=? AND itemId=? AND qty<=0').run(target.id, item.id);

    // Log the admin action
    logger.info('admin_removeitem: %s removed %s x%s from %s', interaction.user.id, item.id, amount, target.id);

    // Define rarity colors and icons
    const rarityColors = {
      'common': 0x95A5A6,
      'uncommon': 0x2ECC71,
      'rare': 0x3498DB,
      'epic': 0x9B59B6,
      'legendary': 0xF39C12,
      'mythic': 0xE74C3C,
      'transcendent': 0xFFD700
    };

    const rarityIcons = {
      'common': '⚪',
      'uncommon': '💚',
      'rare': '💙',
      'epic': '💜',
      'legendary': '👑',
      'mythic': '🔮',
      'transcendent': '🌟'
    };

    const itemColor = rarityColors[item.rarity] || 0xFF6B6B;
    const rarityIcon = rarityIcons[item.rarity] || '📦';

    const embed = new EmbedBuilder()
      .setTitle('❌🗑️ **ITEM REMOVED** 🗑️❌')
      .setDescription('⚠️ *Administrative item removal completed* ⚡')
      .setColor(itemColor)
      .setAuthor({
        name: `${userPrefix} - Staff Tools`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .addFields(
        {
          name: '👤 **Target User**',
          value: `**${target.displayName}**\n\`${target.id}\``,
          inline: true
        },
        {
          name: '🗑️ **Item Removed**',
          value: `${rarityIcon} **${item.name}**\n💎 ${item.rarity || 'common'} rarity\n📊 **-${amount.toLocaleString()}** removed`,
          inline: true
        },
        {
          name: '📉 **Inventory Update**',
          value: `**Previous:** ${previousAmount.toLocaleString()}\n**New Total:** ${newTotal.toLocaleString()}\n**Change:** -${amount.toLocaleString()}`,
          inline: true
        }
      );

    // Add item description if available
    if (item.description) {
      embed.addFields({
        name: '📖 **Item Description**',
        value: item.description,
        inline: false
      });
    }

    // Add removal reason/warning
    embed.addFields({
      name: '⚠️ **Removal Notice**',
      value: newTotal === 0
        ? '🚨 **All instances removed** - Item completely cleared from inventory'
        : `📦 **${newTotal.toLocaleString()}** remaining in inventory`,
      inline: false
    });

    embed.addFields(
      {
        name: '🛡️ **Administrative Details**',
        value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Item Removal`,
        inline: true
      },
      {
        name: '⏰ **Timestamp**',
        value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true
      }
    );

    embed.setFooter({
      text: `🛡️ Staff Action Logged • QuestCord Admin Tools`,
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
