const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const { itemById } = require('../utils/items');
const { ensurePlayerWithVehicles } = require('../utils/players');
const { getUserPrefix } = require('../utils/roles');
const { logCommand } = require('../utils/store_sqlite');

function metaFor(id) {
  return itemById(id) || { name: id };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('🎒 View your inventory with advanced sorting and filtering options')
    .addStringOption(o => o
      .setName('sort')
      .setDescription('📊 How to sort your inventory items')
      .setRequired(false)
      .addChoices(
        { name: '📝 Name (A-Z)', value: 'name' },
        { name: '📈 Quantity (High to Low)', value: 'quantity' },
        { name: '✨ Rarity (Rare to Common)', value: 'rarity' },
        { name: '📂 Category', value: 'category' },
        { name: '⚔️ Equipment Type', value: 'equipslot' }
      ))
    .addStringOption(o => o
      .setName('filter')
      .setDescription('🔍 Filter items by category')
      .setRequired(false)
      .addChoices(
        { name: '📦 All Items', value: 'all' },
        { name: '⚔️ Equipment Only', value: 'equipment' },
        { name: '🗡️ Weapons', value: 'weapon' },
        { name: '🛡️ Armor & Protection', value: 'armor' },
        { name: '🔩 Materials & Resources', value: 'material' },
        { name: '🧪 Consumables & Potions', value: 'consumable' },
        { name: '🚗 Vehicles & Mounts', value: 'vehicle' },
        { name: '💎 Artifacts & Relics', value: 'artifact' }
      )),
  /**
   * Main execution handler for inventory command
   * Processes sorting/filtering options and displays organized inventory
   * 
   * @param {CommandInteraction} interaction - Discord slash command interaction
   */
  async execute(interaction) {
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'inventory', interaction.guild?.id);
    // Lazy load database to avoid circular dependency issues during deployment
    const { db } = require('../utils/store_sqlite');
    const userId = interaction.user.id;
    // Extract user preferences for sorting and filtering (with defaults)
    const sortBy = interaction.options.getString('sort') || 'name';
    const filterBy = interaction.options.getString('filter') || 'all';

    // Ensure player record exists with proper vehicle setup
    await ensurePlayerWithVehicles(interaction.client, userId, interaction.user.username);

    // Apply passive health/stamina regeneration when checking inventory
    try { 
      const { applyRegenForUser } = require('../utils/regen'); 
      applyRegenForUser(userId); 
    } catch {
      // Silently ignore regen errors to prevent command failures
    }

    // Fetch all inventory items with positive quantities
    const rows = db.prepare('SELECT itemId, qty FROM inventory WHERE userId=? AND qty>0').all(userId);
    // Get user's display prefix for embed styling
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    if (rows.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('Empty Inventory')
        .setDescription('Your inventory is currently empty.')
        .setColor(0x95A5A6)
        .addFields(
          {
            name: 'Get Started',
            value: '• Market: Buy items from other players\n• Crafting: Create equipment from materials\n• Boss Battles: Earn rare loot drops\n• Exploration: Find treasures while traveling',
            inline: false
          },
          {
            name: 'Quick Actions',
            value: '• `/market browse` - Browse available items\n• `/craft recipes` - View craftable items\n• `/boss status` - Check for boss battles\n• `/travel` - Explore new servers',
            inline: false
          }
        )
        .setFooter({
          text: `QuestCord`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      return interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
    }

    // Add item metadata to each row
    const itemsWithMeta = rows.map(r => {
      const meta = metaFor(r.itemId);
      return {
        ...r,
        meta: meta,
        name: meta?.name || r.itemId,
        rarity: meta?.rarity || 'common',
        category: meta?.category || 'unknown',
        equipSlot: meta?.equipSlot || null
      };
    });

    // Apply user-selected filters to narrow down displayed items
    let filteredItems = itemsWithMeta;
    if (filterBy !== 'all') {
      switch (filterBy) {
        case 'equipment':
          // Show all items in the equipment category
          filteredItems = itemsWithMeta.filter(item => item.category === 'equipment');
          break;
        case 'weapon':
          // Show only weapon slot equipment
          filteredItems = itemsWithMeta.filter(item => item.equipSlot === 'weapon');
          break;
        case 'armor':
          // Show only armor slot equipment
          filteredItems = itemsWithMeta.filter(item => item.equipSlot === 'armor');
          break;
        case 'material':
        case 'consumable':
        case 'vehicle':
        case 'artifact':
          // Show items matching the specific category
          filteredItems = itemsWithMeta.filter(item => item.category === filterBy);
          break;
      }
    }

    // Apply user-selected sorting to organize the display order
    const rarityOrder = { 'transcendent': 7, 'mythic': 6, 'legendary': 5, 'epic': 4, 'rare': 3, 'uncommon': 2, 'common': 1 };
    switch (sortBy) {
      case 'quantity':
        // Sort by stack size (highest quantities first)
        filteredItems.sort((a, b) => b.qty - a.qty);
        break;
      case 'rarity':
        // Sort by rarity tier (rarest items first)
        filteredItems.sort((a, b) => (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0));
        break;
      case 'category':
        // Sort alphabetically by item category
        filteredItems.sort((a, b) => a.category.localeCompare(b.category));
        break;
      case 'equipslot':
        // Sort by equipment slot type (armor, weapon, etc.)
        filteredItems.sort((a, b) => (a.equipSlot || 'z').localeCompare(b.equipSlot || 'z'));
        break;
      case 'name':
      default:
        // Default: Sort alphabetically by item name
        filteredItems.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    // Define visual indicators for different item rarities (color-coded system)
    const rarityEmojis = {
      'transcendent': '🌟',  // Star - highest tier, ultra rare
      'mythic': '🔮',        // Crystal ball - mythical power
      'legendary': '👑',     // Crown - legendary status
      'epic': '💜',          // Purple heart - epic quality
      'rare': '💙',          // Blue heart - rare finds
      'uncommon': '💚',      // Green heart - uncommon items
      'common': '⚪'           // White circle - common items
    };

    // Define visual indicators for different item categories
    const categoryEmojis = {
      'equipment': '⚔️',    // Crossed swords - combat gear
      'material': '🧱',     // Brick - crafting materials
      'consumable': '🧪',   // Test tube - usable items
      'vehicle': '🚗',       // Car - transportation
      'artifact': '🏺',      // Amphora - special collectibles
      'unknown': '❓'         // Question mark - unrecognized items
    };

    const inventoryEmbed = new EmbedBuilder()
      .setTitle('Inventory')
      .setDescription(`${filteredItems.length} items found • Sorted by ${sortBy}${filterBy !== 'all' ? ` • Filtered: ${filterBy}` : ''}`)
      .setColor(0x3498DB)
      .setAuthor({
        name: `${userPrefix}`,
        iconURL: interaction.user.displayAvatarURL()
      });

    // Organize items by category for structured display
    const itemsByCategory = {};
    filteredItems.forEach(item => {
      const cat = item.category || 'unknown';
      if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
      itemsByCategory[cat].push(item);
    });

    // Calculate inventory statistics for summary display
    const totalValue = filteredItems.reduce((sum, item) => sum + item.qty, 0);  // Total quantity across all stacks
    const uniqueCategories = Object.keys(itemsByCategory).length;               // Number of different categories
    
    inventoryEmbed.addFields({
      name: 'Summary',
      value: `${filteredItems.length} item types\n${totalValue} total quantity\n${uniqueCategories} categories${filterBy !== 'all' ? `\nFilter: ${filterBy}` : ''}`,
      inline: false
    });

    // Display items by category (up to 6 categories to fit embed limits)
    Object.entries(itemsByCategory).slice(0, 6).forEach(([category, items]) => {
      const emoji = categoryEmojis[category] || '📦';
      const itemList = items.slice(0, 8).map(item => {
        const rarityEmoji = rarityEmojis[item.rarity] || '⚪';
        const equipInfo = item.equipSlot ? ` (${item.equipSlot})` : '';
        return `${rarityEmoji} **${item.name}**${equipInfo} × ${item.qty}`;
      }).join('\
');

      const moreItems = items.length > 8 ? `\
... and ${items.length - 8} more` : '';

      inventoryEmbed.addFields({
        name: `${emoji} ${category.toUpperCase()} (${items.length})`,
        value: itemList + moreItems,
        inline: true
      });
    });

    inventoryEmbed.addFields({
      name: 'Inventory Tools',
      value: '• Sort by: Name, Quantity, Rarity, Category, Equipment Type\n• Filter by: Equipment, Weapons, Armor, Materials, etc.\n• Quick Access: `/equip`, `/useitem`, `/craft`',
      inline: false
    });

    inventoryEmbed.setFooter({
      text: `QuestCord`,
      iconURL: interaction.client.user.displayAvatarURL()
    });

    await interaction.reply({ embeds: [inventoryEmbed], ephemeral: true });
  }
};
