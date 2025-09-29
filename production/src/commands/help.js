const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isStaffOrDev, getUserPrefix } = require('../utils/roles');
const { logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('🔍 Display all available commands organized by category')
    .addStringOption(option =>
      option
        .setName('category')
        .setDescription('Show commands from a specific category')
        .addChoices(
          { name: '📋 General', value: 'general' },
          { name: '📊 Player Stats', value: 'stats' },
          { name: '💰 Economy & Trading', value: 'economy' },
          { name: '🗺️ Travel & Exploration', value: 'travel' },
          { name: '🎒 Items & Equipment', value: 'items' },
          { name: '🔨 Crafting', value: 'crafting' },
          { name: '⚔️ Combat & Bosses', value: 'combat' },
          { name: '🏛️ Server Management', value: 'server' },
          { name: '👑 Staff Commands', value: 'staff' }
        )
    ),

  async execute(interaction) {
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'help', interaction.guild?.id);
    const category = interaction.options.getString('category');
    const isStaff = await isStaffOrDev(interaction.client, interaction.user.id);
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);

    if (category) {
      return await this.showCategory(interaction, category, isStaff);
    }

    const embed = new EmbedBuilder()
      .setTitle(`${userPrefix} 🏰 QuestCord Help Center`)
      .setDescription(`
        **Welcome to QuestCord!** 🎮

        Choose a category below to explore all available commands.
        Use \`/help category:<name>\` for detailed information.

        💡 **Quick Tips:**
        • Commands use Discord's slash command system
        • Most commands provide helpful autocomplete suggestions
        • Use \`/stats\` to check your current status anytime!
      `)
      .setColor(0x8B5CF6)
      .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png') // Crown emoji placeholder
      .addFields(
        {
          name: '📋 General',
          value: '`📖` Basic information and utility commands',
          inline: true
        },
        {
          name: '📊 Player Stats',
          value: '`💪` Health, stamina, and character info',
          inline: true
        },
        {
          name: '💰 Economy & Trading',
          value: '`💎` Currency, market, and trading system',
          inline: true
        },
        {
          name: '🗺️ Travel & Exploration',
          value: '`✈️` Movement, locations, and navigation',
          inline: true
        },
        {
          name: '🎒 Items & Equipment',
          value: '`⚔️` Inventory, equipment, and item usage',
          inline: true
        },
        {
          name: '🔨 Crafting',
          value: '`🛠️` Item creation and progression system',
          inline: true
        },
        {
          name: '⚔️ Combat & Bosses',
          value: '`🐲` Fighting mechanics and boss battles',
          inline: true
        },
        {
          name: '🏛️ Server Management',
          value: '`⚙️` Server settings and token management',
          inline: true
        }
      );

    if (isStaff) {
      embed.addFields({
        name: '👑 Staff Commands',
        value: '`🛡️` Administrative and developer tools',
        inline: true
      });
    }

    embed.addFields({
      name: '🔗 Useful Links',
      value: '[📊 Status Page](https://questcord.fun/status) • [💬 Support Server](https://discord.gg/ACGKvKkZ5Z) • [🌐 Website](https://questcord.fun)',
      inline: false
    });

    embed.setFooter({
      text: 'QuestCord • Version 2.1.0 • Made with ❤️ for Discord communities'
    })
    .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },

  async showCategory(interaction, category, isStaff) {
    const embed = new EmbedBuilder().setColor(0x8B5CF6);
    
    switch (category) {
      case 'general':
        embed.setTitle('📋 General Commands')
          .setDescription('Essential commands to get you started with QuestCord')
          .addFields(
            {
              name: '🔍 `/help [category]`',
              value: '• Display the help system with all command categories\n• Use with a specific category to see detailed commands\n• **Example:** `/help category:economy`',
              inline: false
            },
            {
              name: '📍 `/whereami`',
              value: '• Shows your current server location and region\n• Displays travel costs to nearby servers\n• Useful for planning your next adventure',
              inline: false
            }
          )
          .setFooter({ text: '💡 Tip: Most commands provide helpful suggestions when you start typing!' });
        break;
        
      case 'stats':
        embed.setTitle('📊 Player Stats Commands')
          .setDescription('Monitor your character\'s health, resources, and progress')
          .addFields(
            {
              name: '💪 `/stats`',
              value: '• View your current health and stamina levels\n• Check your character\'s experience and level\n• See your equipped items and their effects\n• **Cooldown:** None',
              inline: false
            },
            {
              name: '💰 `/wallet`',
              value: '• Check your current Drakari (currency) balance\n• View recent transaction history\n• See your total earnings and spending\n• **Useful for:** Planning purchases and trades',
              inline: false
            },
          )
          .setFooter({ text: '⚡ Your health and stamina regenerate over time automatically!' });
        break;
        
      case 'economy':
        embed.setTitle('💰 Economy & Trading Commands')
          .setDescription('Trade items, manage your currency, and participate in the global economy')
          .addFields(
            {
              name: '🛒 `/market list [category] [rarity]`',
              value: '• Browse items currently for sale in the global market\n• Filter by category (weapons, armor, consumables, etc.)\n• Sort by rarity or price to find the best deals\n• **Tip:** Use filters to find exactly what you need!',
              inline: false
            },
            {
              name: '💸 `/market sell <item> <quantity> <price>`',
              value: '• List your items for sale on the global market\n• Set competitive prices to sell faster\n• Market takes a small fee (5%) from successful sales\n• **Example:** `/market sell Iron Sword 1 150`',
              inline: false
            },
            {
              name: '🛍️ `/market buy <listing_id>`',
              value: '• Purchase items from other players instantly\n• Items are delivered directly to your inventory\n• Use the listing ID shown in `/market list`\n• **Requirement:** Sufficient Drakari in your wallet',
              inline: false
            },
            {
              name: '❌ `/market cancel <listing_id>`',
              value: '• Cancel your own active market listings\n• Items are returned to your inventory immediately\n• No fees for canceling listings\n• **Note:** You can only cancel your own listings',
              inline: false
            }
          )
          .setFooter({ text: '💡 Market prices fluctuate based on supply and demand!' });
        break;
        
      case 'travel':
        embed.setTitle('🗺️ Travel & Exploration Commands')
          .setDescription('Explore the world, discover new servers, and embark on adventures')
          .addFields(
            {
              name: '✈️ `/travel <server_id>`',
              value: '• Travel to another server to explore new areas\n• **Costs:** Stamina and time (varies by distance)\n• **Rewards:** New biomes, items, and experiences\n• **Tip:** Plan your route using `/nearby` first!',
              inline: false
            },
            {
              name: '📍 `/whereami`',
              value: '• Shows your current server location and region\n• Displays the local biome and its effects\n• See travel costs to nearby popular destinations\n• **Useful for:** Getting your bearings after traveling',
              inline: false
            },
            {
              name: '🗺️ `/nearby`',
              value: '• Lists all servers you can travel to from your current location\n• Shows travel costs (stamina and time) for each destination\n• Displays server population and activity levels\n• **Strategy:** Choose less crowded servers for better loot!',
              inline: false
            },
            {
              name: '🎯 `/waypoints`',
              value: '• Manage your saved waypoints for quick travel\n• Set waypoints at important locations\n• Fast travel to previously visited servers\n• **Limit:** 10 waypoints maximum per player',
              inline: false
            }
          )
          .setFooter({ text: '🌍 Each server offers unique biomes, resources, and challenges!' });
        break;
        
      case 'items':
        embed.setTitle('🎒 Items & Equipment Commands')
          .setDescription('Manage your inventory, equip gear, and use consumables')
          .addFields(
            {
              name: '🎒 `/inventory`',
              value: '• View all items in your inventory with detailed stats\n• See item rarity, durability, and enchantments\n• Sort by category, rarity, or value\n• **Capacity:** 50 slots base (expandable with upgrades)',
              inline: false
            },
            {
              name: '⚔️ `/equip`',
              value: '• Interactive dropdown to equip items from your inventory\n• Automatically shows compatible items for each slot\n• Compare stats between current and new equipment\n• **Slots:** Weapon, Armor, Accessory, Tools',
              inline: false
            },
            {
              name: '🛡️ `/unequip <slot>`',
              value: '• Remove an item from a specific equipment slot\n• Items return to your inventory immediately\n• **Slots:** weapon, armor, accessory, tool\n• **Example:** `/unequip slot:weapon`',
              inline: false
            },
            {
              name: '💊 `/useitem <item>`',
              value: '• Consume items like potions, food, or scrolls\n• Effects apply instantly (healing, buffs, etc.)\n• Some items have cooldowns to prevent abuse\n• **Tip:** Stock up on health potions before traveling!',
              inline: false
            }
          )
          .setFooter({ text: '⚡ Equipment affects your combat effectiveness and resource regeneration!' });
        break;
        
      case 'crafting':
        embed.setTitle('🔨 Crafting Commands')
          .addFields(
            {
              name: '/craft item <item> [quantity]',
              value: 'Start crafting an item (requires materials and time)',
              inline: false
            },
            {
              name: '/craft status',
              value: 'Check your crafting level, progress, and active crafts',
              inline: false
            },
            {
              name: '/craft recipes [rarity]',
              value: 'Browse available recipes you can craft',
              inline: false
            },
            {
              name: '/craft complete',
              value: 'Collect finished crafted items',
              inline: false
            },
            {
              name: '/craft cancel <craft_id>',
              value: 'Cancel an active craft (50% material refund)',
              inline: false
            }
          )
          .setFooter({ 
            text: 'Crafting Tiers: Apprentice → Journeyman → Expert → Artisan → Master → Grandmaster → Transcendent'
          });
        break;
        
      case 'combat':
        embed.setTitle('⚔️ Combat & Bosses Commands')
          .setDescription('Engage in epic battles and face legendary bosses')
          .addFields(
            {
              name: '🐲 `/boss`',
              value: '• View information about the current world boss\n• Join epic battles with other players\n• Earn rare rewards and exclusive loot\n• **Cooldown:** 24 hours between boss fights',
              inline: false
            },
            {
              name: '🗡️ `/challenges`',
              value: '• View available combat challenges\n• Take on special monsters for extra rewards\n• Progress through difficulty tiers\n• **Reset:** Daily challenges refresh at midnight UTC',
              inline: false
            }
          )
          .setFooter({ text: '🏆 Boss battles require strategy, teamwork, and good equipment!' });
        break;
        
      case 'server':
        embed.setTitle('🏛️ Server Management Commands')
          .addFields(
            {
              name: '/tokens balance',
              value: 'Check your server\'s token balance',
              inline: false
            },
            {
              name: '/tokens buy',
              value: 'Get information on purchasing server tokens',
              inline: false
            },
            {
              name: '/biome',
              value: 'Change your server\'s biome (requires tokens)',
              inline: false
            },
            {
              name: '/relocate country <name>',
              value: 'Move your server to a specific country (requires tokens)',
              inline: false
            },
            {
              name: '/relocate list [continent]',
              value: 'Browse available countries and their token costs',
              inline: false
            },
            {
              name: '/relocate search <query>',
              value: 'Search for countries by name',
              inline: false
            }
          );
        break;
        
      case 'staff':
        if (!isStaff) {
          return interaction.reply({ 
            content: 'You do not have permission to view staff commands.', 
            ephemeral: true 
          });
        }
        
        embed.setTitle('👑 Staff & Developer Commands')
          .addFields(
            {
              name: '/teleport <server_id>',
              value: 'Instantly teleport to any server (staff only)',
              inline: false
            },
            {
              name: '/additem <user> <item> <amount>',
              value: 'Give items to any user',
              inline: false
            },
            {
              name: '/removeitem <user> <item> <amount>',
              value: 'Remove items from any user',
              inline: false
            },
            {
              name: '/setstats <user> <stat> <value>',
              value: 'Set health or stamina for any user',
              inline: false
            },
            {
              name: '/ban add/remove/list',
              value: 'Manage global user bans',
              inline: false
            },
            {
              name: '/server archive/restore/list',
              value: 'Archive, restore, or list servers',
              inline: false
            },
            {
              name: '/clear inventory/equipment <user>',
              value: 'Clear user inventory or equipped items (requires confirmation)',
              inline: false
            }
          )
          .setFooter({ 
            text: 'Role Hierarchy: Developer > Staff > Premium > User (higher roles inherit all lower permissions)'
          });
        break;
        
      default:
        return interaction.reply({ 
          content: 'Invalid category. Use `/help` to see all available categories.', 
          ephemeral: true 
        });
    }
    
    return interaction.reply({ embeds: [embed] });
  }
};