const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { getUserPrefix, isStaffOrDev } = require('../utils/roles');
const { getAllCountries, getCountry, findCountries, getCountriesByContinent } = require('../utils/countries');
const { findLandPosition } = require('../utils/geo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relocate')
    .setDescription('Move your server to a different country using tokens')
    .addSubcommand(sc => sc
      .setName('country')
      .setDescription('Move your server to a specific country')
      .addStringOption(o => o
        .setName('name')
        .setDescription('Country name (e.g., "Japan", "Germany", "Australia")')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('List all available countries and their token costs')
      .addStringOption(o => o
        .setName('continent')
        .setDescription('Filter by continent')
        .addChoices(
          { name: 'Europe', value: 'Europe' },
          { name: 'Asia', value: 'Asia' },
          { name: 'North America', value: 'North America' },
          { name: 'South America', value: 'South America' },
          { name: 'Africa', value: 'Africa' },
          { name: 'Oceania', value: 'Oceania' },
          { name: 'Antarctica', value: 'Antarctica' }
        )
      )
    )
    .addSubcommand(sc => sc
      .setName('search')
      .setDescription('Search for countries by name')
      .addStringOption(o => o
        .setName('query')
        .setDescription('Part of country name to search for')
        .setRequired(true)
      )
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const countries = getAllCountries();
    
    // Filter countries based on input
    const filtered = countries.filter(country => 
      country.name.toLowerCase().startsWith(focusedValue.toLowerCase())
    ).slice(0, 25); // Discord limit

    await interaction.respond(
      filtered.map(country => ({
        name: `${country.name} (${country.cost} tokens)`,
        value: country.name
      }))
    );
  },

  async execute(interaction) {
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    const subcommand = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `relocate ${subcommand}`, interaction.guild?.id);

    // Check if user has server management permissions
    if (!interaction.member.permissions.has('ManageGuild') && !await isStaffOrDev(interaction.client, interaction.user.id)) {
      return interaction.reply({
        content: `${userPrefix} Only server managers can relocate the server.`,
        ephemeral: true
      });
    }

    if (subcommand === 'list') {
      const continent = interaction.options.getString('continent');
      
      if (continent) {
        // Show specific continent
        const countries = getCountriesByContinent()[continent];
        if (!countries || countries.length === 0) {
          return interaction.reply({
            content: `${userPrefix} No countries found for ${continent}.`,
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🌍 ${continent} - Available Countries`)
          .setDescription('Choose a country to relocate your server')
          .setColor(0x3498db);

        // Group countries by cost for better organization
        const byCost = {};
        countries.forEach(country => {
          if (!byCost[country.cost]) byCost[country.cost] = [];
          byCost[country.cost].push(country.name);
        });

        for (const [cost, countryList] of Object.entries(byCost).sort((a, b) => a[0] - b[0])) {
          embed.addFields({
            name: `💰 ${cost} Tokens`,
            value: countryList.join(', '),
            inline: false
          });
        }

        embed.setFooter({ text: `Use /relocate country <name> to move your server` });
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        // Show all continents overview
        const continents = getCountriesByContinent();
        const embed = new EmbedBuilder()
          .setTitle('🌎 Server Relocation - All Regions')
          .setDescription('Select a continent to see available countries')
          .setColor(0x3498db);

        for (const [continentName, countries] of Object.entries(continents)) {
          const costs = [...new Set(countries.map(c => c.cost))].sort((a, b) => a - b);
          const costRange = costs.length === 1 ? `${costs[0]} tokens` : `${costs[0]}-${costs[costs.length - 1]} tokens`;
          
          embed.addFields({
            name: `${continentName} (${countries.length} countries)`,
            value: `Cost: ${costRange}`,
            inline: true
          });
        }

        embed.setFooter({ text: 'Use /relocate list continent:<name> for detailed listings' });
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    if (subcommand === 'search') {
      const query = interaction.options.getString('query');
      const results = findCountries(query);

      if (results.length === 0) {
        return interaction.reply({
          content: `${userPrefix} No countries found matching "${query}".`,
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setColor(0x3498db);

      const resultText = results.slice(0, 20).map(country => 
        `**${country.name}** - ${country.continent} (${country.cost} tokens)`
      ).join('\n');

      embed.setDescription(resultText);
      
      if (results.length > 20) {
        embed.setFooter({ text: `Showing first 20 of ${results.length} results` });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'country') {
      const countryName = interaction.options.getString('name');
      const country = getCountry(countryName);

      if (!country) {
        // Try fuzzy search
        const matches = findCountries(countryName);
        if (matches.length === 0) {
          return interaction.reply({
            content: `${userPrefix} Country "${countryName}" not found. Use \`/relocate search\` to find available countries.`,
            ephemeral: true
          });
        } else if (matches.length === 1) {
          // Auto-select single match
          return this.executeRelocation(interaction, matches[0], userPrefix);
        } else {
          // Multiple matches
          const matchList = matches.slice(0, 5).map(c => c.name).join(', ');
          return interaction.reply({
            content: `${userPrefix} Multiple countries match "${countryName}": ${matchList}. Please be more specific.`,
            ephemeral: true
          });
        }
      }

      return this.executeRelocation(interaction, country, userPrefix);
    }
  },

  async executeRelocation(interaction, country, userPrefix) {
    const guildId = interaction.guild.id;
    
    // Get current server data
    const serverData = db.prepare('SELECT tokens, lat, lon, name FROM servers WHERE guildId=?').get(guildId);
    if (!serverData) {
      return interaction.reply({
        content: `${userPrefix} Server not found in database. Please contact support.`,
        ephemeral: true
      });
    }

    const currentTokens = serverData.tokens || 0;
    const requiredTokens = country.cost;

    // Check if server has enough tokens
    if (currentTokens < requiredTokens) {
      return interaction.reply({
        content: `${userPrefix} Insufficient tokens! You need **${requiredTokens}** tokens to relocate to **${country.name}**, but only have **${currentTokens}**.\n\nUse \`/tokens buy\` to purchase more tokens.`,
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      // Find a land position in the target country
      console.log(`Finding land position for ${country.name} at ${country.lat}, ${country.lon}`);
      const landPosition = await findLandPosition(country.lat, country.lon, 30);
      
      // Deduct tokens and update position
      db.prepare('UPDATE servers SET tokens = tokens - ?, lat = ?, lon = ? WHERE guildId = ?')
        .run(requiredTokens, landPosition.lat, landPosition.lon, guildId);

      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('🎉 Server Relocated Successfully!')
        .setColor(0x27ae60)
        .addFields(
          { name: '📍 New Location', value: country.name, inline: true },
          { name: '🌍 Continent', value: country.continent, inline: true },
          { name: '💰 Cost', value: `${requiredTokens} tokens`, inline: true },
          { name: '🏦 Remaining Tokens', value: `${currentTokens - requiredTokens}`, inline: true },
          { name: '🗺️ Coordinates', value: `${landPosition.lat.toFixed(4)}, ${landPosition.lon.toFixed(4)}`, inline: true }
        )
        .setFooter({ text: 'Your server is now visible on the map in its new location!' });

      await interaction.editReply({ content: `${userPrefix}`, embeds: [embed] });
      
      // Log the relocation
      console.log(`Server ${guildId} relocated to ${country.name} for ${requiredTokens} tokens`);

    } catch (error) {
      console.error('Relocation error:', error);
      await interaction.editReply({
        content: `${userPrefix} Failed to relocate server. Please try again or contact support.`
      });
    }
  }
};