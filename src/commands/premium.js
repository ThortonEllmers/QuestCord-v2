const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix, isPremium } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const { itemById } = require('../utils/items');
const { getGemBalance, spendGems } = require('../utils/gems');
const { db, logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');

// Premium equipment prices in gems
const PREMIUM_EQUIPMENT_PRICES = {
  'private_jet': 500,
  'transcendent_blade_of_infinity': 1200,
  'armor_of_eternal_guardian': 1000,
  'crown_of_infinite_wisdom': 800,
  'floating_platform': 300,
  'submarine': 400,
  'spaceship': 1500,
  'time_machine': 2000
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Access premium-exclusive features and equipment')
    .addSubcommand(sc => sc
      .setName('shop')
      .setDescription('Browse premium-exclusive equipment'))
    .addSubcommand(sc => sc
      .setName('buy')
      .setDescription('Purchase premium equipment with gems')
      .addStringOption(o => o
        .setName('item')
        .setDescription('Premium item to purchase')
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand(sc => sc
      .setName('status')
      .setDescription('View your premium status and benefits')),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const userId = interaction.user.id;
    
    // Only premium users can see premium equipment
    if (!await isPremium(interaction.client, userId)) {
      return interaction.respond([
        { name: 'Premium access required', value: 'premium_required' }
      ]);
    }

    // Get all premium equipment
    const allItems = config.items || [];
    const premiumItems = allItems.filter(item => 
      item.premiumNeeded && 
      PREMIUM_EQUIPMENT_PRICES[item.id] &&
      item.name.toLowerCase().includes(focusedValue.toLowerCase())
    );

    const choices = premiumItems.slice(0, 25).map(item => ({
      name: `${item.name} (${PREMIUM_EQUIPMENT_PRICES[item.id]} gems)`,
      value: item.id
    }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    regenStamina(interaction.user.id);

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const isPremiumUser = await isPremium(interaction.client, userId);

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `premium ${subcommand}`, interaction.guild?.id);

    if (subcommand === 'status') {
      const gemBalance = getGemBalance(userId);
      
      const statusEmbed = new EmbedBuilder()
        .setTitle(isPremiumUser ? 'Premium Status' : 'Premium Upgrade')
        .setDescription(isPremiumUser ?
          'You have access to exclusive premium features' :
          'Upgrade to premium for exclusive benefits')
        .setColor(isPremiumUser ? 0xFFD700 : 0x95A5A6)
        .setAuthor({ 
          name: `${userPrefix}${isPremiumUser ? ' - Premium Member' : ' - Standard Account'}`,
          iconURL: interaction.user.displayAvatarURL() 
        });

      if (isPremiumUser) {
        statusEmbed.addFields(
          {
            name: '👑 **Premium Benefits Active**',
            value: '• 🚀 **3x Travel Speed**: Faster movement between servers\n• 💰 **2x Income**: Double drakari from all sources\n• ⚔️ **Premium Equipment**: Access exclusive legendary gear\n• 🏪 **Market Priority**: Your listings appear first\n• 💸 **Reduced Fees**: 50% off market listing costs\n• ⏰ **Extended Listings**: 2x market listing duration',
            inline: false
          },
          {
            name: '💎 **Your Gem Balance**',
            value: `**${gemBalance.toLocaleString()} gems**\n${gemBalance >= 300 ? '✅ Can afford premium equipment' : '⏳ Keep earning gems for premium purchases'}`,
            inline: true
          },
          {
            name: '🛍️ **Premium Shop Access**',
            value: 'Use `/premium shop` to browse exclusive equipment\nUse `/premium buy <item>` to purchase',
            inline: true
          }
        );

        // Show premium equipment owned
        const premiumItems = db.prepare(`
          SELECT i.itemId, i.qty 
          FROM inventory i 
          WHERE i.userId = ? AND i.qty > 0
        `).all(userId);
        
        const ownedPremiumEquipment = [];
        premiumItems.forEach(inv => {
          const item = itemById(inv.itemId);
          if (item && item.premiumNeeded) {
            ownedPremiumEquipment.push(`${item.name} × ${inv.qty}`);
          }
        });

        if (ownedPremiumEquipment.length > 0) {
          statusEmbed.addFields({
            name: '⚔️ **Premium Equipment Owned**',
            value: ownedPremiumEquipment.slice(0, 10).join('\n') + 
                   (ownedPremiumEquipment.length > 10 ? `\n... and ${ownedPremiumEquipment.length - 10} more` : ''),
            inline: false
          });
        }
      } else {
        statusEmbed.addFields(
          {
            name: '🎯 **Premium Benefits**',
            value: '• 🚀 **3x Travel Speed**: Get around the world faster\n• 💰 **2x Income**: Earn double drakari from activities\n• ⚔️ **Exclusive Equipment**: Access legendary premium gear\n• 🏪 **Market Priority**: Your listings appear first to buyers\n• 💸 **Fee Reduction**: Save 50% on market listing fees\n• ⏰ **Extended Duration**: Your market listings last twice as long',
            inline: false
          },
          {
            name: '💎 **Your Gem Balance**',
            value: `**${gemBalance.toLocaleString()} gems**\n${gemBalance >= 50 ? '✅ Can purchase premium trials' : '⏳ Earn more gems for premium access'}`,
            inline: true
          },
          {
            name: '🛒 **Get Premium Access**',
            value: 'Use `/gems buy` to purchase premium trials\n• 1-Day Trial: 50 gems\n• 7-Day Trial: 300 gems\n• 30-Day Trial: 1000 gems',
            inline: true
          }
        );

        statusEmbed.addFields({
          name: '💡 **How to Earn Gems**',
          value: '• 📅 **Daily Login**: Up to 7 gems per day\n• ⚔️ **Boss Battles**: 5-15 gems per fight\n• 🌍 **Server Visits**: 2 gems per new server\n• 🎯 **Challenges**: Complete daily and weekly tasks\n• 🏆 **Achievements**: Unlock milestone rewards',
          inline: false
        });
      }

      statusEmbed.setFooter({ 
        text: `${isPremiumUser ? '👑 Premium benefits are active' : '⭐ Upgrade today for exclusive features'} • QuestCord Premium`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [statusEmbed] });
    }

    if (subcommand === 'shop') {
      if (!isPremiumUser) {
        return interaction.reply({ 
          content: `${userPrefix} Premium access required. Use \`/gems buy\` to get premium time, then access the premium shop!`, 
          ephemeral: true 
        });
      }

      const gemBalance = getGemBalance(userId);
      const allItems = config.items || [];
      const premiumEquipment = allItems.filter(item => 
        item.premiumNeeded && PREMIUM_EQUIPMENT_PRICES[item.id]
      ).sort((a, b) => PREMIUM_EQUIPMENT_PRICES[a.id] - PREMIUM_EQUIPMENT_PRICES[b.id]);

      const shopEmbed = new EmbedBuilder()
        .setTitle('👑🏪 **PREMIUM EQUIPMENT SHOP** 🏪👑')
        .setDescription('⚔️ *Legendary gear exclusive to premium members* ⚔️')
        .setColor(0xFFD700)
        .setAuthor({ 
          name: `${userPrefix} - Premium Collector`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields({
          name: '💎 **Your Gem Balance**',
          value: `**${gemBalance.toLocaleString()} gems**\n${gemBalance >= 300 ? '✅ Can afford most premium items' : gemBalance >= 50 ? '⚡ Can afford some premium items' : '⏳ Keep earning gems'}`,
          inline: false
        });

      // Group items by category
      const categories = {
        'vehicle': { name: '🚗 Vehicles', items: [] },
        'equipment': { name: '⚔️ Equipment', items: [] },
        'artifact': { name: '🏺 Artifacts', items: [] },
        'other': { name: '🌟 Special', items: [] }
      };

      premiumEquipment.forEach(item => {
        const category = item.category === 'vehicle' ? 'vehicle' : 
                        item.equipSlot ? 'equipment' :
                        item.category === 'artifact' ? 'artifact' : 'other';
        categories[category].items.push(item);
      });

      // Display items by category
      Object.entries(categories).forEach(([key, category]) => {
        if (category.items.length > 0) {
          const itemList = category.items.slice(0, 4).map(item => {
            const price = PREMIUM_EQUIPMENT_PRICES[item.id];
            const canAfford = gemBalance >= price;
            const statusIcon = canAfford ? '✅' : '❌';
            const rarityEmojis = {
              'legendary': '👑',
              'mythic': '🔮',
              'transcendent': '🌟',
              'epic': '💜'
            };
            const rarityIcon = rarityEmojis[item.rarity] || '⭐';
            
            return `${statusIcon} ${rarityIcon} **${item.name}**\n💎 ${price.toLocaleString()} gems • ${item.rarity}\n📋 ${item.description.slice(0, 50)}...`;
          }).join('\n\n');

          shopEmbed.addFields({
            name: `${category.name} (${category.items.length})`,
            value: itemList + (category.items.length > 4 ? `\n... and ${category.items.length - 4} more` : ''),
            inline: false
          });
        }
      });

      shopEmbed.addFields(
        {
          name: '🛒 **How to Purchase**',
          value: '• Use `/premium buy <item_name>` to purchase\n• Items are permanently added to inventory\n• Premium status required to use premium equipment\n• Most powerful gear in the game!',
          inline: true
        },
        {
          name: '💡 **Equipment Tips**',
          value: '• **Vehicles**: Provide unique travel options\n• **Weapons/Armor**: Superior stats to regular gear\n• **Artifacts**: Special abilities and bonuses\n• **Transcendent**: Highest tier equipment available',
          inline: true
        }
      );

      shopEmbed.setFooter({ 
        text: `👑 Premium equipment gives you a significant advantage • QuestCord Premium Shop`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [shopEmbed] });
    }

    if (subcommand === 'buy') {
      const itemId = interaction.options.getString('item');
      
      if (!isPremiumUser) {
        return interaction.reply({ 
          content: `${userPrefix} Premium access required. Use \`/gems buy\` to get premium time first!`, 
          ephemeral: true 
        });
      }

      if (itemId === 'premium_required') {
        return interaction.reply({ 
          content: `${userPrefix} You need premium access to purchase premium equipment.`, 
          ephemeral: true 
        });
      }

      const item = itemById(itemId);
      const price = PREMIUM_EQUIPMENT_PRICES[itemId];

      if (!item || !price || !item.premiumNeeded) {
        return interaction.reply({ 
          content: `${userPrefix} Invalid premium item. Use autocomplete to see available options.`, 
          ephemeral: true 
        });
      }

      const gemBalance = getGemBalance(userId);
      
      if (gemBalance < price) {
        return interaction.reply({ 
          content: `${userPrefix} Insufficient gems. You have ${gemBalance} gems but need ${price} gems.`, 
          ephemeral: true 
        });
      }

      // Process purchase
      const success = spendGems(userId, price, 'premium_equipment', `Purchased ${item.name}`);
      
      if (!success) {
        return interaction.reply({ 
          content: `${userPrefix} Purchase failed. Please try again.`, 
          ephemeral: true 
        });
      }

      // Add item to inventory
      const existing = db.prepare('SELECT qty FROM inventory WHERE userId = ? AND itemId = ?').get(userId, itemId);
      if (existing) {
        db.prepare('UPDATE inventory SET qty = qty + 1 WHERE userId = ? AND itemId = ?').run(userId, itemId);
      } else {
        db.prepare('INSERT INTO inventory (userId, itemId, qty) VALUES (?, ?, 1)').run(userId, itemId);
      }

      const purchaseEmbed = new EmbedBuilder()
        .setTitle('🎉👑 **PREMIUM PURCHASE COMPLETE** 👑🎉')
        .setDescription('⚔️ *Legendary equipment added to your collection* ⚔️')
        .setColor(0xFFD700)
        .setAuthor({ 
          name: `${userPrefix} - Premium Collector`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '🛍️ **Item Purchased**',
            value: `👑 **${item.name}**\n${item.rarity.toUpperCase()} ${item.category}\n${item.description}`,
            inline: false
          },
          {
            name: '💎 **Cost**',
            value: `**${price.toLocaleString()} gems**\nDeducted from balance`,
            inline: true
          },
          {
            name: '💳 **New Balance**',
            value: `**${(gemBalance - price).toLocaleString()} gems**\nRemaining in treasury`,
            inline: true
          },
          {
            name: '📦 **Inventory**',
            value: `Item added to inventory\nUse \`/inventory\` to view\n${item.equipSlot ? `Use \`/equip ${item.name}\` to equip` : 'Ready to use'}`,
            inline: true
          }
        );

      if (item.equipSlot) {
        purchaseEmbed.addFields({
          name: '⚔️ **Equipment Stats**',
          value: `**Slot**: ${item.equipSlot}\n**Rarity**: ${item.rarity}\n**Category**: ${item.category}\n**Premium Only**: ✅`,
          inline: true
        });
      }

      purchaseEmbed.addFields({
        name: '🌟 **Premium Equipment Benefits**',
        value: '• **Exclusive Access**: Only premium users can own and use\n• **Superior Performance**: Best stats in the game\n• **Prestige Factor**: Show off your premium status\n• **Future Updates**: New premium equipment added regularly',
        inline: false
      });

      purchaseEmbed.setFooter({ 
        text: `👑 Enjoy your new premium equipment! • QuestCord Premium Collection`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [purchaseEmbed] });
    }
  }
};