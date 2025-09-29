const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { itemByNameOrId, itemById } = require('../utils/items');
const { isBanned, regenStamina } = require('./_guard');
const { getUserPrefix, isPremium } = require('../utils/roles');
const config = require('../utils/config');
const { ensurePlayerWithVehicles } = require('../utils/players');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('equip')
    .setDescription('Equip an item from your inventory'),
  async execute(interaction){
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'equip', interaction.guild?.id);
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    regenStamina(interaction.user.id);
    
    const userId = interaction.user.id;
    
    // Ensure player exists with proper vehicle setup
    await ensurePlayerWithVehicles(interaction.client, userId, interaction.user.username);
    
    // Get user's inventory
    const inventory = db.prepare('SELECT itemId, qty FROM inventory WHERE userId=? AND qty>0').all(userId);
    
    if (!inventory || inventory.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('Inventory Empty')
        .setDescription('Your inventory contains no items to equip')
        .setColor(0xFF6B6B)
        .setAuthor({
          name: `${userPrefix}`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields({
          name: 'Get Started',
          value: '• Visit the /market to buy equipment\n• Complete quests to earn items\n• Craft items with /craft\n• Trade with other players',
          inline: false
        })
        .setFooter({
          text: `QuestCord Equipment`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      return interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
    }
    
    // Filter for equippable items only
    const equippableItems = inventory
      .map(inv => {
        const item = itemById(inv.itemId);
        return item && item.equipSlot ? { ...item, qty: inv.qty } : null;
      })
      .filter(item => item !== null)
      .slice(0, 25); // Discord limit of 25 select menu options
    
    if (equippableItems.length === 0) {
      const noEquipEmbed = new EmbedBuilder()
        .setTitle('**NO EQUIPPABLE ITEMS**')
        .setDescription('Your inventory contains no equipment that can be equipped')
        .setColor(0xFF6B6B)
        .setAuthor({ 
          name: `${userPrefix}`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '**Inventory Status**',
            value: `**${inventory.length}** total items\n**0** equippable items`,
            inline: true
          },
          {
            name: '**Find Equipment**',
            value: '• Browse /market for gear\n• Look for items with equipment slots\n• Check item descriptions',
            inline: true
          }
        )
        .setFooter({ 
          text: `Look for weapons, armor, and accessories • QuestCord Equipment`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      return interaction.reply({ embeds: [noEquipEmbed], ephemeral: true });
    }
    
    // Group items by equipment slot for better organization
    const slotGroups = {};
    equippableItems.forEach(item => {
      if (!slotGroups[item.equipSlot]) {
        slotGroups[item.equipSlot] = [];
      }
      slotGroups[item.equipSlot].push(item);
    });
    
    // Create select menu options
    const options = [];
    Object.keys(slotGroups).sort().forEach(slot => {
      slotGroups[slot].forEach(item => {
        const slotIcon = {
          weapon: '⚔️',
          armor: '🛡️', 
          vehicle: '🚗',
          accessory: '💍',
          tool: '🔨'
        }[slot] || '📦';
        
        options.push({
          label: `${item.name}`,
          description: `${slot.charAt(0).toUpperCase() + slot.slice(1)} • ${item.rarity} • Qty: ${item.qty}`,
          value: item.id,
          emoji: slotIcon
        });
      });
    });
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('equip_select')
      .setPlaceholder('Choose an item to equip...')
      .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // Create stunning equipment selection embed
    const currentEquipment = db.prepare('SELECT slot, itemId FROM equipment WHERE userId=?').all(userId);
    const equipmentSummary = currentEquipment.map(eq => {
      const item = itemById(eq.itemId);
      const slotIcon = {
        weapon: '⚔️',
        armor: '🛡️', 
        vehicle: '🚗',
        accessory: '💍',
        tool: '🔨'
      }[eq.slot] || '📦';
      return `${slotIcon} **${eq.slot}:** ${item?.name || 'Unknown'}`;
    }).join('\n') || 'No equipment currently equipped';

    const equipEmbed = new EmbedBuilder()
      .setTitle('**EQUIPMENT MANAGEMENT**')
      .setDescription('*Choose your gear wisely, adventurer*')
      .setColor(0x00AE86)
      .setAuthor({ 
        name: `${userPrefix} - Equipment Master`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .addFields(
        {
          name: '**Available Equipment**',
          value: `**${equippableItems.length}** items ready to equip\nSelect from the menu below`,
          inline: true
        },
        {
          name: '**Equipment Slots**',
          value: `${Object.keys(slotGroups).length} different slot types available`,
          inline: true
        },
        {
          name: '**Rarity Distribution**',
          value: Object.entries(equippableItems.reduce((acc, item) => {
            acc[item.rarity] = (acc[item.rarity] || 0) + 1;
            return acc;
          }, {})).map(([rarity, count]) => `${rarity}: ${count}`).join('\n') || 'No items',
          inline: true
        }
      )
      .addFields({
        name: '**Currently Equipped**',
        value: equipmentSummary,
        inline: false
      })
      .setFooter({ 
        text: `Equipping items can boost your combat effectiveness • QuestCord Equipment`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    const response = await interaction.reply({
      embeds: [equipEmbed],
      components: [row],
      ephemeral: true
    });
    
    try {
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60000,
        filter: i => i.user.id === interaction.user.id
      });
      
      const itemId = confirmation.values[0];
      const item = itemById(itemId);
      
      if (!item) {
        return confirmation.update({ 
          content: `${userPrefix} Item not found.`, 
          components: [] 
        });
      }
      
      // Double-check user still owns the item
      const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(userId, item.id);
      if (!inv || inv.qty <= 0) {
        return confirmation.update({ 
          content: `${userPrefix} You no longer own this item.`, 
          components: [] 
        });
      }
      
      // Check premium requirement
      if (item.premiumNeeded && !(await isPremium(interaction.client, userId))){
        return confirmation.update({ 
          content: `${userPrefix} This item requires Premium membership.`, 
          components: [] 
        });
      }
      
      // Equip the item
      db.prepare('INSERT OR REPLACE INTO equipment(userId, slot, itemId) VALUES(?,?,?)').run(userId, item.equipSlot, item.id);
      
      if (item.equipSlot === 'vehicle'){
        db.prepare('UPDATE players SET vehicle=? WHERE userId=?').run(item.id, userId);
      }
      
      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle('**EQUIPMENT SUCCESSFUL**')
        .setDescription('*Your gear has been equipped and is ready for battle!*')
        .setColor(0x00D26A)
        .setAuthor({ 
          name: `${userPrefix} - Gear Updated`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '**Item Equipped**',
            value: `**${item.name}**\n${item.rarity} ${item.equipSlot}`,
            inline: true
          },
          {
            name: '**Slot**',
            value: `**${item.equipSlot.toUpperCase()}**\nReady for action`,
            inline: true
          },
          {
            name: '**Rarity**',
            value: `**${item.rarity.toUpperCase()}**\n${item.premiumNeeded ? 'Premium Item' : 'Standard Quality'}`,
            inline: true
          }
        );

      if (item.description) {
        successEmbed.addFields({
          name: '**Item Description**',
          value: item.description,
          inline: false
        });
      }

      if (item.effects) {
        const effectsText = Object.entries(item.effects)
          .map(([key, value]) => `**${key}:** ${value}`)
          .join('\n');
        successEmbed.addFields({
          name: '**Item Effects**',
          value: effectsText,
          inline: false
        });
      }

      successEmbed
        .setFooter({ 
          text: `Equipment ready for combat! Use /stats to see changes • QuestCord Equipment`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      await confirmation.update({
        embeds: [successEmbed],
        components: []
      });
      
    } catch (error) {
      await interaction.editReply({
        content: `${userPrefix} Equipment selection timed out.`,
        components: []
      });
    }
  }
};
