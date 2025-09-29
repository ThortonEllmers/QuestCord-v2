const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { getAllPOIs, getPOIById, getPOIsByCategory, getNearbyPOIs, hasVisitedPOI, getUserVisitedPOIs, getUserPOIVisitCount, visitPOI, calculateDistance } = require('../utils/pois');
const { isBanned, regenStamina } = require('./_guard');
const { getUserPrefix, isPremium } = require('../utils/roles');
const config = require('../utils/config');
const { ensurePlayerWithVehicles } = require('../utils/players');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poi')
    .setDescription('Explore famous landmarks and points of interest around the world')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('View all available points of interest')
        .addStringOption(option =>
          option
            .setName('category')
            .setDescription('Filter by category')
            .setRequired(false)
            .addChoices(
              { name: 'All', value: 'all' },
              { name: 'Monuments', value: 'monument' },
              { name: 'Historical Sites', value: 'historical' },
              { name: 'Cultural Sites', value: 'cultural' },
              { name: 'Natural Wonders', value: 'natural' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('visit')
        .setDescription('Visit a specific point of interest')
        .addStringOption(option =>
          option
            .setName('landmark')
            .setDescription('Choose a landmark to visit')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('nearby')
        .setDescription('Find points of interest near your current location')
        .addIntegerOption(option =>
          option
            .setName('radius')
            .setDescription('Search radius in kilometers (default: 500)')
            .setRequired(false)
            .setMinValue(100)
            .setMaxValue(2000)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('profile')
        .setDescription('View your POI exploration progress')
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const pois = getAllPOIs();
    
    const filtered = pois.filter(poi => 
      poi.name.toLowerCase().includes(focusedValue) ||
      poi.country.toLowerCase().includes(focusedValue)
    ).slice(0, 25);
    
    await interaction.respond(
      filtered.map(poi => ({
        name: `${poi.emoji} ${poi.name} (${poi.country})`,
        value: poi.id
      }))
    );
  },

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) {
      return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    }
    
    regenStamina(interaction.user.id);
    const userId = interaction.user.id;
    
    // Ensure player exists
    await ensurePlayerWithVehicles(interaction.client, userId, interaction.user.username);
    
    const subcommand = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `poi ${subcommand}`, interaction.guild?.id);

    switch (subcommand) {
      case 'list':
        await this.handleList(interaction, userPrefix);
        break;
      case 'visit':
        await this.handleVisit(interaction, userPrefix, userId);
        break;
      case 'nearby':
        await this.handleNearby(interaction, userPrefix, userId);
        break;
      case 'profile':
        await this.handleProfile(interaction, userPrefix, userId);
        break;
    }
  },

  async handleList(interaction, userPrefix) {
    const category = interaction.options.getString('category') || 'all';
    
    let pois;
    if (category === 'all') {
      pois = getAllPOIs();
    } else {
      pois = getPOIsByCategory(category);
    }
    
    if (pois.length === 0) {
      return interaction.reply({
        content: `${userPrefix} No points of interest found in that category.`,
        ephemeral: true
      });
    }
    
    // Group POIs by category for better display
    const grouped = pois.reduce((acc, poi) => {
      if (!acc[poi.category]) acc[poi.category] = [];
      acc[poi.category].push(poi);
      return acc;
    }, {});
    
    const embed = new EmbedBuilder()
      .setTitle('🌍 **WORLD LANDMARKS & POINTS OF INTEREST**')
      .setDescription('*Discover famous landmarks and earn rewards for your first visit*')
      .setColor(0x3498DB)
      .setAuthor({
        name: `${userPrefix} - World Explorer`,
        iconURL: interaction.user.displayAvatarURL()
      });
    
    // Add fields for each category
    Object.entries(grouped).forEach(([cat, landmarks]) => {
      const categoryEmojis = {
        monument: '🏛️',
        historical: '🏺',
        cultural: '🎭',
        natural: '🌿'
      };
      
      const landmarkList = landmarks.slice(0, 8).map(poi => 
        `${poi.emoji} **${poi.name}** (${poi.country})\n💰 ${poi.discoveryReward} ${config.currencyName} reward`
      ).join('\n\n');
      
      embed.addFields({
        name: `${categoryEmojis[cat] || '📍'} **${cat.charAt(0).toUpperCase() + cat.slice(1)} Sites**`,
        value: landmarkList || 'No landmarks available',
        inline: false
      });
    });
    
    embed.setFooter({
      text: `Use /poi visit <landmark> to explore • ${pois.length} total landmarks available`,
      iconURL: interaction.client.user.displayAvatarURL()
    }).setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },

  async handleVisit(interaction, userPrefix, userId) {
    const landmarkId = interaction.options.getString('landmark');
    const poi = getPOIById(landmarkId);
    
    if (!poi) {
      return interaction.reply({
        content: `${userPrefix} Landmark not found.`,
        ephemeral: true
      });
    }
    
    // Check if user has enough currency for visit cost
    const player = db.prepare('SELECT drakari, locationGuildId FROM players WHERE userId = ?').get(userId);
    if (!player || player.drakari < poi.visitCost) {
      return interaction.reply({
        content: `${userPrefix} Insufficient funds! You need ${poi.visitCost} ${config.currencyName} to visit ${poi.name}. You have ${player?.drakari || 0}.`,
        ephemeral: true
      });
    }
    
    // Check if already visited
    if (hasVisitedPOI(userId, landmarkId)) {
      const embed = new EmbedBuilder()
        .setTitle('🚫 **ALREADY VISITED**')
        .setDescription(`You have already explored **${poi.name}**!`)
        .setColor(0xE74C3C)
        .setAuthor({
          name: `${userPrefix} - Travel Log`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '📍 **Location**',
            value: `${poi.emoji} ${poi.name}\n${poi.country}`,
            inline: true
          },
          {
            name: '💡 **Tip**',
            value: 'Visit other landmarks to earn discovery rewards!',
            inline: true
          }
        );
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    try {
      // Deduct visit cost
      db.prepare('UPDATE players SET drakari = drakari - ? WHERE userId = ?').run(poi.visitCost, userId);
      
      // Record the visit and get rewards
      const visitResult = visitPOI(userId, landmarkId);
      
      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('🎉 **LANDMARK DISCOVERED!**')
        .setDescription(`*Welcome to ${poi.name}, ${interaction.user.username}!*`)
        .setColor(0x00D26A)
        .setAuthor({
          name: `${userPrefix} - World Explorer`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
          {
            name: '📍 **Landmark**',
            value: `${poi.emoji} **${poi.name}**\n${poi.country}`,
            inline: true
          },
          {
            name: '💰 **Discovery Reward**',
            value: `+${visitResult.reward} ${config.currencyName}\nFirst visit bonus!`,
            inline: true
          },
          {
            name: '💸 **Visit Cost**',
            value: `-${poi.visitCost} ${config.currencyName}\nTravel expenses`,
            inline: true
          }
        );
      
      if (poi.description) {
        embed.addFields({
          name: '📖 **About This Landmark**',
          value: poi.description,
          inline: false
        });
      }
      
      // Add coordinates
      embed.addFields({
        name: '🗺️ **Coordinates**',
        value: `Latitude: ${poi.lat.toFixed(4)}\nLongitude: ${poi.lon.toFixed(4)}`,
        inline: true
      });
      
      // Show visit count progress
      const visitCount = getUserPOIVisitCount(userId);
      const totalPOIs = getAllPOIs().length;
      
      embed.addFields({
        name: '🏆 **Exploration Progress**',
        value: `${visitCount}/${totalPOIs} landmarks discovered\n${((visitCount/totalPOIs)*100).toFixed(1)}% world explored`,
        inline: true
      });
      
      embed.setFooter({
        text: 'Keep exploring to discover more amazing landmarks! • QuestCord Travel',
        iconURL: interaction.client.user.displayAvatarURL()
      }).setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('POI visit error:', error);
      return interaction.reply({
        content: `${userPrefix} ${error.message}`,
        ephemeral: true
      });
    }
  },

  async handleNearby(interaction, userPrefix, userId) {
    const radius = interaction.options.getInteger('radius') || 500;
    
    // Get player's current location
    const player = db.prepare('SELECT locationGuildId FROM players WHERE userId = ?').get(userId);
    if (!player || !player.locationGuildId) {
      return interaction.reply({
        content: `${userPrefix} You need to be located at a server to find nearby landmarks. Use /travel to go somewhere first!`,
        ephemeral: true
      });
    }
    
    // Get server coordinates
    const server = db.prepare('SELECT lat, lon, name FROM servers WHERE guildId = ?').get(player.locationGuildId);
    if (!server || server.lat == null || server.lon == null) {
      return interaction.reply({
        content: `${userPrefix} Server location not found.`,
        ephemeral: true
      });
    }
    
    const nearbyPOIs = getNearbyPOIs(server.lat, server.lon, radius);
    
    if (nearbyPOIs.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🔍 **NO LANDMARKS NEARBY**')
        .setDescription(`No landmarks found within ${radius}km of ${server.name}`)
        .setColor(0xE67E22)
        .setAuthor({
          name: `${userPrefix} - Location Scout`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .addFields({
          name: '💡 **Try Expanding Your Search**',
          value: 'Use `/poi nearby radius:1000` to search a wider area, or use `/poi list` to see all available landmarks.',
          inline: false
        });
      
      return interaction.reply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🗺️ **NEARBY LANDMARKS**')
      .setDescription(`Found ${nearbyPOIs.length} landmark${nearbyPOIs.length === 1 ? '' : 's'} within ${radius}km of **${server.name}**`)
      .setColor(0x3498DB)
      .setAuthor({
        name: `${userPrefix} - Location Scout`,
        iconURL: interaction.user.displayAvatarURL()
      });
    
    nearbyPOIs.slice(0, 10).forEach(poi => {
      const distance = calculateDistance(server.lat, server.lon, poi.lat, poi.lon);
      const visited = hasVisitedPOI(userId, poi.id);
      const status = visited ? '✅ Visited' : '⭐ Undiscovered';
      
      embed.addFields({
        name: `${poi.emoji} **${poi.name}**`,
        value: `📍 ${poi.country}\n📏 ${distance.toFixed(0)}km away\n${status}\n💰 ${poi.discoveryReward} ${config.currencyName} reward`,
        inline: true
      });
    });
    
    embed.setFooter({
      text: `Use /poi visit <landmark> to explore • Showing closest ${Math.min(nearbyPOIs.length, 10)} landmarks`,
      iconURL: interaction.client.user.displayAvatarURL()
    }).setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },

  async handleProfile(interaction, userPrefix, userId) {
    const visitedPOIs = getUserVisitedPOIs(userId);
    const totalPOIs = getAllPOIs().length;
    const visitCount = visitedPOIs.length;
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 **EXPLORATION PROFILE**')
      .setDescription('*Your world exploration achievements and discovered landmarks*')
      .setColor(0x9B59B6)
      .setAuthor({
        name: `${userPrefix} - World Explorer`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .addFields(
        {
          name: '📊 **Exploration Stats**',
          value: `**${visitCount}**/${totalPOIs} landmarks discovered\n**${((visitCount/totalPOIs)*100).toFixed(1)}%** of world explored`,
          inline: true
        },
        {
          name: '🎯 **Explorer Rank**',
          value: this.getExplorerRank(visitCount, totalPOIs),
          inline: true
        }
      );
    
    if (visitedPOIs.length > 0) {
      // Group visited POIs by category
      const visitedByCategory = visitedPOIs.reduce((acc, poi) => {
        if (!acc[poi.category]) acc[poi.category] = [];
        acc[poi.category].push(poi);
        return acc;
      }, {});
      
      Object.entries(visitedByCategory).forEach(([category, pois]) => {
        const categoryEmojis = {
          monument: '🏛️',
          historical: '🏺',
          cultural: '🎭',
          natural: '🌿'
        };
        
        const poiList = pois.slice(0, 5).map(poi => 
          `${poi.emoji} ${poi.name} (${poi.country})`
        ).join('\n');
        
        embed.addFields({
          name: `${categoryEmojis[category] || '📍'} **${category.charAt(0).toUpperCase() + category.slice(1)} (${pois.length})**`,
          value: poiList + (pois.length > 5 ? `\n*...and ${pois.length - 5} more*` : ''),
          inline: true
        });
      });
      
      // Show most recent visits
      const recentVisits = visitedPOIs.slice(0, 3);
      embed.addFields({
        name: '🕐 **Recent Discoveries**',
        value: recentVisits.map(poi => 
          `${poi.emoji} **${poi.name}** - <t:${Math.floor(poi.visitedAt/1000)}:R>`
        ).join('\n') || 'No recent visits',
        inline: false
      });
    } else {
      embed.addFields({
        name: '🚀 **Get Started**',
        value: 'Use `/poi list` to see available landmarks\nUse `/poi nearby` to find landmarks near you\nUse `/poi visit <landmark>` to start exploring!',
        inline: false
      });
    }
    
    embed.setFooter({
      text: 'Keep exploring to unlock new achievements! • QuestCord Explorer',
      iconURL: interaction.client.user.displayAvatarURL()
    }).setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },

  getExplorerRank(visited, total) {
    const percentage = (visited / total) * 100;
    
    if (percentage === 0) return '🌱 **Novice Explorer**\nYour journey begins here!';
    if (percentage < 10) return '🚶 **Tourist**\nTaking your first steps!';
    if (percentage < 25) return '🎒 **Backpacker**\nGetting the hang of it!';
    if (percentage < 50) return '✈️ **Jet Setter**\nSeasoned traveler!';
    if (percentage < 75) return '🌍 **Globe Trotter**\nExperienced explorer!';
    if (percentage < 90) return '🏆 **World Wanderer**\nLegendary adventurer!';
    if (percentage < 100) return '👑 **Master Explorer**\nAlmost conquered the world!';
    return '🌟 **World Conqueror**\nYou\'ve seen it all!';
  }
};