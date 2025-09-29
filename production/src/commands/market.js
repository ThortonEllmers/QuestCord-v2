const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');
const { getUserPrefix, isPremium } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');
const logger = require('../utils/logger');
const { itemById, isTradable } = require('../utils/items');

/**
 * Checks if an item is blocked from trading
 * @param {string} itemId - The item ID to check
 * @returns {boolean} True if item cannot be traded
 */
function blocked(itemId){ return !isTradable(itemId); }

module.exports = {
  // Define slash command structure with four main subcommands
  data: new SlashCommandBuilder()
    .setName('market').setDescription('Player market')
    // Subcommand 1: Buy a specific listing by ID
    .addSubcommand(sc=>sc.setName('buy').setDescription('Buy a listing')
      .addIntegerOption(o=>o.setName('listing').setDescription('Listing ID').setRequired(true)))
    // Subcommand 2: Cancel user's own listing and return items
    .addSubcommand(sc=>sc.setName('cancel').setDescription('Cancel your listing')
      .addIntegerOption(o=>o.setName('listing').setDescription('Listing ID').setRequired(true)))
    // Subcommand 3: Browse all active listings with interactive buttons
    .addSubcommand(sc=>sc.setName('browse').setDescription('Browse top listings'))
    // Subcommand 4: Sell items from inventory with quick-sell interface
    .addSubcommand(sc=>sc.setName('sell').setDescription('Sell items from your inventory')),
  
  /**
   * Main execution handler for market command
   * Routes to appropriate subcommand handler after security and player setup
   * 
   * @param {CommandInteraction} interaction - Discord slash command interaction
   */
  async execute(interaction){
    // Get user's display prefix (premium users get special prefixes)
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    // Security check: prevent banned users from using market
    if (isBanned(interaction.user.id)) return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    // Regenerate stamina based on time elapsed since last update
    regenStamina(interaction.user.id);
    // Extract which subcommand was used
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `market ${sub}`, interaction.guild?.id);
    // Ensure player record exists in database for market transactions
    const ensure = db.prepare('SELECT * FROM players WHERE userId=?').get(userId);
    if (!ensure) db.prepare('INSERT INTO players(userId, name) VALUES(?,?)').run(userId, interaction.user.username);

    // List subcommand removed - use /market sell with buttons instead
    if (false && sub === 'list'){
      const itemId = interaction.options.getString('item');
      const item = itemById(itemId);
      if (!item) return interaction.reply({ content: `${userPrefix} Unknown item id.`, ephemeral: true });
      if (blocked(itemId)) return interaction.reply({ content: `${userPrefix} This item cannot be traded.`, ephemeral: true });
      const qty = interaction.options.getInteger('qty');
      const price = interaction.options.getInteger('price');
      const duration = interaction.options.getString('duration');
      const mult = { '10m':600, '1h':3600, '6h':21600, '12h':43200, '24h':86400 }[duration];
      if (!mult) return interaction.reply({ content: `${userPrefix} Duration must be one of 10m,1h,6h,12h,24h`, ephemeral: true });
      const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(userId, itemId);
      if (!inv || inv.qty < qty) return interaction.reply({ content: `${userPrefix} Not enough items.`, ephemeral: true });
      
      // Check listing limits
      const isPremiumUser = await isPremium(interaction.client, userId);
      const maxListings = isPremiumUser ? 5 : 2;
      
      const currentListings = db.prepare('SELECT COUNT(*) as count FROM market_listings WHERE sellerId = ? AND expiresAt > ?')
        .get(userId, Date.now());
      
      if (currentListings.count >= maxListings) {
        return interaction.reply({ 
          content: `${userPrefix} Market listing limit reached! ${isPremiumUser ? 'Premium users' : 'Users'} can have up to **${maxListings}** active listings.\n\nCancel existing listings with \`/market cancel <listing_id>\` or upgrade to premium for more slots.`, 
          ephemeral: true 
        });
      }
      
      // Premium users get longer listing durations and reduced listing fees
      let actualExpires = Date.now() + mult*1000;
      
      // Premium users get 2x listing duration
      if (isPremiumUser) {
        actualExpires = Date.now() + (mult * 2 * 1000);
      }
      
      // Check for listing fee (premium users get 50% off)
      const listingFee = Math.floor(price * 0.02); // 2% listing fee
      const actualFee = isPremiumUser ? Math.floor(listingFee * 0.5) : listingFee;
      
      const playerBalance = db.prepare('SELECT drakari FROM players WHERE userId=?').get(userId);
      if (playerBalance.drakari < actualFee) {
        return interaction.reply({ 
          content: `${userPrefix} Insufficient funds for listing fee. Required: ${actualFee} ${config.currencyName}`, 
          ephemeral: true 
        });
      }
      
      // Deduct listing fee and inventory item
      if (actualFee > 0) {
        db.prepare('UPDATE players SET drakari=drakari-? WHERE userId=?').run(actualFee, userId);
      }
      db.prepare('UPDATE inventory SET qty=qty-? WHERE userId=? AND itemId=?').run(qty, userId, itemId);
      const info = db.prepare('INSERT INTO market_listings(sellerId,itemId,qty,price,expiresAt) VALUES(?,?,?,?,?)').run(userId, itemId, qty, price, actualExpires);
      logger.info('market_list: user %s listed %s x%s for %s', userId, itemId, qty, price);
      const listingEmbed = new EmbedBuilder()
        .setTitle(isPremiumUser ? '📈👑 **PREMIUM LISTING CREATED** 👑📈' : '📈 **ITEM LISTED SUCCESSFULLY** 📈')
        .setDescription(isPremiumUser ? 
          '⭐ *Your premium listing gets priority display and extended duration* ⭐' :
          '✨ *Your item has been added to the marketplace* ✨')
        .setColor(isPremiumUser ? 0xFFD700 : 0x00AE86)
        .setAuthor({ 
          name: `${userPrefix}${isPremiumUser ? ' - Premium Seller' : ' - Merchant'}`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '📦 **Listed Item**',
            value: `**${item.name}** × ${qty}${isPremiumUser ? ' ⭐' : ''}`,
            inline: true
          },
          {
            name: '💰 **Asking Price**',
            value: `${price.toLocaleString()} ${config.currencyName}\n(${Math.round(price/qty).toLocaleString()} each)`,
            inline: true
          },
          {
            name: '🆔 **Listing ID**',
            value: `**#${info.lastInsertRowid}**\n📋 Use for buy/cancel`,
            inline: true
          },
          {
            name: '💸 **Listing Fee**',
            value: `${actualFee.toLocaleString()} ${config.currencyName}${isPremiumUser ? ' (50% off)' : ''}\n${((actualFee/price)*100).toFixed(1)}% of price`,
            inline: true
          },
          {
            name: '⏰ **Duration**',
            value: `${duration}${isPremiumUser ? ' × 2 (premium bonus)' : ''}\nExpires: <t:${Math.floor(actualExpires/1000)}:R>`,
            inline: true
          },
          {
            name: '📈 **Sale Tax**',
            value: `${config.marketTaxPct}% on sale\n(${Math.floor(price * (config.marketTaxPct/100)).toLocaleString()} ${config.currencyName})`,
            inline: true
          },
          {
            name: '💎 **You\'ll Receive**',
            value: `${(price - Math.floor(price * (config.marketTaxPct/100))).toLocaleString()} ${config.currencyName}\nAfter ${config.marketTaxPct}% sale tax`,
            inline: true
          }
        );
        
        if (isPremiumUser) {
          listingEmbed.addFields({
            name: '👑 **Premium Benefits**',
            value: '• ⭐ **Priority Display**: Your listings appear first\n• ⏰ **2x Duration**: Double the listing time\n• 💸 **50% Off Fees**: Reduced listing costs\n• 🎯 **Premium Badge**: ⭐ shown on listings',
            inline: false
          });
        } else {
          listingEmbed.addFields({
            name: '💡 **Upgrade to Premium**',
            value: '• Get priority listing display\
• Double listing duration\
• 50% off listing fees\
• Use `/gems buy` to get premium time',
            inline: false
          });
        }
        
        listingEmbed.setFooter({ 
          text: `📈 ${isPremiumUser ? 'Premium listings get priority display' : 'Use /market browse to see all listings'} • QuestCord`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [listingEmbed] });
    }

    // Handle buy subcommand - purchase a specific marketplace listing
    if (sub === 'buy'){
      // Extract the listing ID from command parameters
      const id = interaction.options.getInteger('listing');
      // Fetch the listing data from database
      const row = db.prepare('SELECT * FROM market_listings WHERE id=?').get(id);
      if (!row) return interaction.reply({ content:`${userPrefix} Listing not found.`, ephemeral: true });
      // Check if listing has expired
      if (row.expiresAt < Date.now()) return interaction.reply({ content:`${userPrefix} Listing expired.`, ephemeral: true });
      // Verify item is still tradable (policies may have changed)
      if (!isTradable(row.itemId)) return interaction.reply({ content:`${userPrefix} This item is no longer tradable.`, ephemeral: true });
      // Get full item data for premium requirement checks
      const item = itemById(row.itemId);
      // Check if premium-only item requires premium status
      if (item?.premiumNeeded && !(await isPremium(interaction.client, userId))){
        return interaction.reply({ content:`${userPrefix} This listing is Premium-only.`, ephemeral: true });
      }
      // Prevent users from buying their own listings
      if (row.sellerId === userId) return interaction.reply({ content:`${userPrefix} Cannot buy your own listing.`, ephemeral: true });
      // Check if buyer has sufficient funds
      const buyer = db.prepare('SELECT drakari FROM players WHERE userId=?').get(userId);
      if (buyer.drakari < row.price) return interaction.reply({ content:`${userPrefix} Not enough funds.`, ephemeral: true });
      // Calculate market tax and net amount for seller
      const tax = Math.floor(row.price * (config.marketTaxPct/100));
      const net = row.price - tax;
      // Process payment: deduct from buyer, credit seller (minus tax)
      db.prepare('UPDATE players SET drakari=drakari-? WHERE userId=?').run(row.price, userId);
      db.prepare('UPDATE players SET drakari=drakari+? WHERE userId=?').run(net, row.sellerId);
      // Transfer items to buyer's inventory
      const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(userId, row.itemId);
      if (!inv) db.prepare('INSERT INTO inventory(userId,itemId,qty) VALUES(?,?,?)').run(userId, row.itemId, row.qty);
      else db.prepare('UPDATE inventory SET qty=qty+? WHERE userId=? AND itemId=?').run(row.qty, userId, row.itemId);
      // Remove completed listing from marketplace
      db.prepare('DELETE FROM market_listings WHERE id=?').run(id);
      logger.info('market_buy: user %s bought listing %s', userId, id);
      const purchaseEmbed = new EmbedBuilder()
        .setTitle('✨ Purchase Complete!')
        .setDescription('Your transaction has been processed successfully')
        .setColor(0x00AE86)
        .setAuthor({ 
          name: `${userPrefix}`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '📦 Item Purchased',
            value: `**${item ? item.name : row.itemId}** × ${row.qty}`,
            inline: true
          },
          {
            name: '💳 Total Paid',
            value: `${row.price.toLocaleString()} ${config.currencyName}`,
            inline: true
          },
          {
            name: '🆔 Listing ID',
            value: `#${id}`,
            inline: true
          },
          {
            name: '💸 Market Tax',
            value: `${tax.toLocaleString()} ${config.currencyName}`,
            inline: true
          },
          {
            name: '👤 Seller Received',
            value: `${net.toLocaleString()} ${config.currencyName}`,
            inline: true
          },
          {
            name: '✅ Status',
            value: 'Transaction Complete',
            inline: true
          }
        )
        .setFooter({ 
          text: `Check /inventory to see your new items • QuestCord`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [purchaseEmbed] });
    }

    // Handle cancel subcommand - remove user's own listing and return items
    if (sub === 'cancel'){
      // Extract the listing ID from command parameters
      const id = interaction.options.getInteger('listing');
      // Fetch the listing data from database
      const row = db.prepare('SELECT * FROM market_listings WHERE id=?').get(id);
      if (!row) return interaction.reply({ content:`${userPrefix} Listing not found.`, ephemeral: true });
      // Security check: only allow users to cancel their own listings
      if (row.sellerId !== userId) return interaction.reply({ content:`${userPrefix} Not your listing.`, ephemeral: true });
      // Remove the listing from the marketplace
      db.prepare('DELETE FROM market_listings WHERE id=?').run(id);
      // Return the items to the seller's inventory
      const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(userId, row.itemId);
      if (!inv) db.prepare('INSERT INTO inventory(userId,itemId,qty) VALUES(?,?,?)').run(userId, row.itemId, row.qty);
      else db.prepare('UPDATE inventory SET qty=qty+? WHERE userId=? AND itemId=?').run(row.qty, userId, row.itemId);
      logger.info('market_cancel: user %s cancelled listing %s', userId, id);
      const cancelEmbed = new EmbedBuilder()
        .setTitle('🚫 Listing Cancelled')
        .setDescription('Your marketplace listing has been removed and items returned')
        .setColor(0xFF6B6B)
        .setAuthor({ 
          name: `${userPrefix}`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '📦 Items Returned',
            value: `**${itemById(row.itemId)?.name || row.itemId}** × ${row.qty}`,
            inline: true
          },
          {
            name: '🆔 Cancelled Listing',
            value: `#${id}`,
            inline: true
          },
          {
            name: '✅ Status',
            value: 'Items back in inventory',
            inline: true
          }
        )
        .setFooter({ 
          text: `Use /inventory to see your items • QuestCord`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [cancelEmbed] });
    }

    // Handle browse subcommand - display all active marketplace listings with interactive buttons
    if (sub === 'browse'){
      // Premium priority system: Premium sellers' listings appear first
      // Fetch premium listings (from premium users) sorted by price
      const premiumListings = db.prepare(`
        SELECT ml.*, p.isPremium 
        FROM market_listings ml
        LEFT JOIN players p ON ml.sellerId = p.userId
        WHERE ml.expiresAt > ? AND p.isPremium = 1
        ORDER BY ml.price ASC
        LIMIT 6
      `).all(Date.now());
      
      // Fetch regular listings to fill remaining slots (up to 10 total)
      const regularListings = db.prepare(`
        SELECT ml.*, p.isPremium 
        FROM market_listings ml
        LEFT JOIN players p ON ml.sellerId = p.userId
        WHERE ml.expiresAt > ? AND (p.isPremium IS NULL OR p.isPremium = 0)
        ORDER BY ml.price ASC
        LIMIT ?
      `).all(Date.now(), 10 - premiumListings.length);
      
      // Combine listings with premium priority (premium first, then regular)
      const rows = [...premiumListings, ...regularListings];
      if (!rows.length) return interaction.reply({ content: `${userPrefix} No active listings found.`, ephemeral: true });
      
      const totalValue = rows.reduce((sum, r) => sum + (r.price * r.qty), 0);
      const uniqueItems = new Set(rows.map(r => r.itemId)).size;

      const embed = new EmbedBuilder()
        .setTitle('Marketplace')
        .setDescription(`Market Statistics:\n• ${rows.length} active listings\n• ${uniqueItems} unique items\n• ${totalValue.toLocaleString()} ${config.currencyName} total value\n• ${config.marketTaxPct}% transaction tax\n• Premium sellers get priority display`)
        .setColor(0x00AE86)
        .setAuthor({
          name: `${userPrefix}`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setFooter({
          text: `QuestCord`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      const components = [];
      let currentRow = new ActionRowBuilder();
      
      // Group items by rarity for better display
      const rarityColors = {
        'common': '⚪',
        'uncommon': '🟢', 
        'rare': '🔵',
        'epic': '🟣',
        'legendary': '🟠',
        'mythic': '🔴',
        'transcendent': '✨'
      };
      
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const it = itemById(r.itemId);
        const name = it ? it.name : r.itemId;
        const prem = it?.premiumNeeded ? ' 👑' : '';
        const premiumSeller = r.isPremium ? ' ⭐' : ''; // Premium seller indicator
        const timeLeft = Math.ceil((r.expiresAt - Date.now()) / 60000);
        const seller = await interaction.client.users.fetch(r.sellerId).catch(() => null);
        const sellerName = seller ? seller.username : 'Unknown';
        const rarity = it?.rarity || 'common';
        const rarityIcon = rarityColors[rarity] || '⚪';
        
        const pricePerUnit = Math.round(r.price / r.qty);
        const timeDisplay = timeLeft > 60 ? `${Math.round(timeLeft/60)}h` : `${timeLeft}m`;
        
        embed.addFields({
          name: `${rarityIcon} **#${r.id}** ${name}${prem}${premiumSeller}`,
          value: `🔢 **Qty:** ${r.qty.toLocaleString()}\n` +
                 `💰 **Price:** ${r.price.toLocaleString()} ${config.currencyName}\n` +
                 `📈 **Per Unit:** ${pricePerUnit.toLocaleString()} ${config.currencyName}\n` +
                 `👤 **Seller:** ${sellerName}\n` +
                 `⏰ **Expires:** ${timeDisplay}`,
          inline: true
        });

        const button = new ButtonBuilder()
          .setCustomId(`market_buy_${r.id}`)
          .setLabel(`Buy #${r.id}`)
          .setStyle(rarity === 'legendary' || rarity === 'mythic' || rarity === 'transcendent' ? ButtonStyle.Danger : 
                   rarity === 'epic' || rarity === 'rare' ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setEmoji(rarityIcon);

        currentRow.addComponents(button);
        
        // Discord allows max 5 buttons per row, max 5 rows per message
        if (currentRow.components.length === 5 || i === rows.length - 1) {
          components.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
        
        // Max 5 action rows
        if (components.length === 5) break;
      }
      
      if (rows.length > 0) {
        embed.addFields({
          name: 'Trading Tips',
          value: '• Compare prices before buying\n• Check item rarity and effects\n• Premium items require Premium status\n• Consider bulk discounts on large quantities',
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }

    // Handle sell subcommand - display user's tradable inventory with quick-sell interface
    if (sub === 'sell') {
      // Get user's complete inventory with quantity > 0
      const rawInventory = db.prepare(`
        SELECT itemId, qty 
        FROM inventory 
        WHERE userId = ? AND qty > 0
        ORDER BY itemId
      `).all(userId);

      // Filter and enrich inventory data with item details and tradability
      const inventory = rawInventory.map(inv => {
        const item = itemById(inv.itemId);
        return item ? {
          itemId: inv.itemId,
          qty: inv.qty,
          name: item.name,
          rarity: item.rarity || 'common',
          description: item.description,
          category: item.category,
          tradable: item.tradable !== false  // Only include tradable items
        } : null;
      }).filter(item => item && item.tradable);

      // Check if user has any tradable items
      if (inventory.length === 0) {
        return interaction.reply({
          content: `${userPrefix} You don't have any tradable items to sell. Complete quests and defeat bosses to earn items!`,
          ephemeral: true
        });
      }

      // Check current listing usage and limits
      const isPremiumUser = await isPremium(interaction.client, userId);
      const maxListings = isPremiumUser ? 5 : 2;  // Premium users get more listing slots
      const currentListings = db.prepare('SELECT COUNT(*) as count FROM market_listings WHERE sellerId = ? AND expiresAt > ?')
        .get(userId, Date.now());
      
      const sellEmbed = new EmbedBuilder()
        .setTitle('Sell Items')
        .setDescription(`Choose items from your inventory to list on the market\n\nListing Slots: ${currentListings.count}/${maxListings} used${isPremiumUser ? ' (Premium)' : ''}`)
        .setColor(0xFFD700)
        .setAuthor({
          name: `${userPrefix}`,
          iconURL: interaction.user.displayAvatarURL()
        });

      // Group items by rarity for better display
      const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'transcendent'];
      const groupedInventory = {};
      
      inventory.forEach(item => {
        const rarity = item.rarity || 'common';
        if (!groupedInventory[rarity]) groupedInventory[rarity] = [];
        groupedInventory[rarity].push(item);
      });

      // Build inventory display
      let inventoryText = '';
      let itemCount = 0;
      
      rarityOrder.forEach(rarity => {
        if (groupedInventory[rarity] && itemCount < 20) { // Limit to prevent embed overflow
          const rarityIcon = {
            common: '⚪',
            uncommon: '🟢', 
            rare: '🔵',
            epic: '🟣',
            legendary: '🟠',
            mythic: '🔴',
            transcendent: '⭐'
          }[rarity] || '⚪';

          inventoryText += `\n**${rarityIcon} ${rarity.charAt(0).toUpperCase() + rarity.slice(1)} Items:**\n`;
          
          groupedInventory[rarity].slice(0, 10 - itemCount).forEach(item => {
            inventoryText += `• **${item.name}** (${item.qty}x) - ID: \`${item.itemId}\`\n`;
            itemCount++;
          });
        }
      });

      sellEmbed.addFields(
        {
          name: 'Your Tradable Inventory',
          value: inventoryText.length > 0 ? inventoryText : 'No items to display',
          inline: false
        },
        {
          name: 'How to Sell Items',
          value: '1. Click any item button below for quick selling\n2. Fill in price, quantity, and duration in the popup\n3. Choose duration: 10m, 1h, 6h, 12h, or 24h\n4. Your item will be listed on the market instantly!',
          inline: false
        },
        {
          name: 'Selling Tips',
          value: `• Check \`/market browse\` to see current prices\n• Price competitively for faster sales\n• Higher rarity items sell for more\n• Listing limits: 2 slots (5 for Premium)\n• Premium users get 2x listing duration\n• Market tax: ${config.marketTaxPct || 5}% of sale price`,
          inline: false
        }
      );

      // Add quick sell buttons for common items
      const components = [];
      const quickSellRow = new ActionRowBuilder();
      
      // Add buttons for first few items (max 5 buttons per row)
      const topItems = inventory.slice(0, 5);
      topItems.forEach(item => {
        const rarityIcon = {
          common: '⚪',
          uncommon: '🟢',
          rare: '🔵', 
          epic: '🟣',
          legendary: '🟠',
          mythic: '🔴',
          transcendent: '⭐'
        }[item.rarity] || '⚪';

        quickSellRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`quick_sell_${item.itemId}`)
            .setLabel(`${item.name} (${item.qty})`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(rarityIcon)
        );
      });

      if (quickSellRow.components.length > 0) {
        components.push(quickSellRow);
      }

      sellEmbed.setFooter({
        text: `${inventory.length} tradable items • QuestCord`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      return interaction.reply({ embeds: [sellEmbed], components, ephemeral: true });
    }
  }
};
