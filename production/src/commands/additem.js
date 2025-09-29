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
    .setName('additem')
    .setDescription('🎁 Give items to any user (Staff/Developer only)')
    .addUserOption(o => o
      .setName('user')
      .setDescription('👤 Target user to receive the item')
      .setRequired(true))
    .addStringOption(o => o
      .setName('item')
      .setDescription('🎒 Item to give (use autocomplete)')
      .setAutocomplete(true)
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('amount')
      .setDescription('📊 Quantity to give (minimum 1)')
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
    logCommand(interaction.user.id, 'additem', interaction.guild?.id);
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

    // Get role level for logging
    const adminRole = await fetchRoleLevel(interaction.user.id);

    // Check if user already has the item
    const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(target.id, item.id);
    const previousAmount = inv?.qty || 0;

    // Add item to inventory
    if (!inv) {
      db.prepare('INSERT INTO inventory(userId,itemId,qty) VALUES(?,?,?)').run(target.id, item.id, amount);
    } else {
      db.prepare('UPDATE inventory SET qty=qty+? WHERE userId=? AND itemId=?').run(amount, target.id, item.id);
    }

    const newTotal = previousAmount + amount;

    // Log the admin action
    logger.info('admin_additem: %s added %s x%s to %s', interaction.user.id, item.id, amount, target.id);

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

    const itemColor = rarityColors[item.rarity] || 0x00AE86;
    const rarityIcon = rarityIcons[item.rarity] || '📦';

    const embed = new EmbedBuilder()
      .setTitle('🎁✅ **ITEM GRANTED** ✅🎁')
      .setDescription('✨ *Administrative item distribution completed successfully* ⚡')
      .setColor(itemColor)
      .setAuthor({
        name: `${userPrefix} - Staff Tools`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .addFields(
        {
          name: '👤 **Recipient**',
          value: `**${target.displayName}**\n\`${target.id}\``,
          inline: true
        },
        {
          name: '🎒 **Item Granted**',
          value: `${rarityIcon} **${item.name}**\n💎 ${item.rarity || 'common'} rarity\n📊 **+${amount.toLocaleString()}** added`,
          inline: true
        },
        {
          name: '📈 **Inventory Update**',
          value: `**Previous:** ${previousAmount.toLocaleString()}\n**New Total:** ${newTotal.toLocaleString()}\n**Change:** +${amount.toLocaleString()}`,
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

    // Add item effects if available
    if (item.effects && Object.keys(item.effects).length > 0) {
      const effectsText = Object.entries(item.effects).map(([key, value]) => {
        const effectIcon = {
          'health': '❤️',
          'stamina': '💨',
          'damage': '⚔️',
          'defense': '🛡️',
          'speed': '⚡'
        }[key.toLowerCase()] || '✨';

        return `${effectIcon} **${key.charAt(0).toUpperCase() + key.slice(1)}:** ${value}`;
      }).join('\n');

      embed.addFields({
        name: '🔮 **Item Effects**',
        value: effectsText,
        inline: false
      });
    }

    embed.addFields(
      {
        name: '🛡️ **Administrative Details**',
        value: `**Staff Member:** ${interaction.user.displayName}\n**Role Level:** ${adminRole || 'Staff'}\n**Action:** Item Grant`,
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
