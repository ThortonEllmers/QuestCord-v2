const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../utils/store_sqlite');
const { haversine } = require('../utils/geo');
const { getUserPrefix } = require('../utils/roles');
const { logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder().setName('nearby').setDescription('Show nearest servers to this server.'),
  async execute(interaction){
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'nearby', interaction.guild?.id);

    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    const center = db.prepare('SELECT * FROM servers WHERE guildId=? AND archived=0').get(interaction.guild.id);
    if (!center || center.lat==null){
      return interaction.reply({ content: `${userPrefix} This server has no coordinates yet. Try again shortly.`, ephemeral: true });
    }
    const rows = db.prepare('SELECT guildId, name, lat, lon FROM servers WHERE lat IS NOT NULL AND lon IS NOT NULL AND archived=0').all();
    const withDist = rows.map(r => ({...r, dist: haversine(center.lat, center.lon, r.lat, r.lon)}));
    withDist.sort((a,b)=>a.dist-b.dist);
    const top = withDist.slice(0, 25); // Reduced for embed space
    
    const totalServers = withDist.length;
    const averageDistance = totalServers > 0 ? Math.round(withDist.reduce((sum, s) => sum + s.dist, 0) / totalServers) : 0;
    
    const embed = new EmbedBuilder()
      .setTitle('🗺️🌍 **SERVER EXPLORER** 🌍🗺️')
      .setDescription(`🎯 *Discovering Discord servers near your location* ⚡\n\n📍 **Current Server:** ${center.name || interaction.guild.name}\n🌐 **${totalServers}** servers discovered | 📏 **${averageDistance}km** average distance`)
      .setColor(0x00AE86)
      .setAuthor({ 
        name: `${userPrefix} - Navigator`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setFooter({ 
        text: `✈️ Use /travel <server> to visit other communities • QuestCord Navigator`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    if (top.length === 0) {
      embed.addFields({
        name: '🔍❌ **NO SERVERS NEARBY** ❌🔍',
        value: '• No other servers found in this area\n• Be the first to connect with communities here!\n• New servers join the network daily\n• Check back later for new connections',
        inline: false
      });
    } else {
      // Categorize by distance for better organization
      const nearby = top.filter(r => r.dist <= 100);
      const moderate = top.filter(r => r.dist > 100 && r.dist <= 500);
      const distant = top.filter(r => r.dist > 500);

      // Add statistics
      embed.addFields({
        name: '📊 **Server Statistics**',
        value: `🔍 **${nearby.length}** nearby servers (≤100km)\n🌐 **${moderate.length}** distant servers (100-500km)\n🚀 **${distant.length}** far servers (>500km)`,
        inline: false
      });

      // Display servers by category
      if (nearby.length > 0) {
        const nearbyLines = nearby.slice(0, 8).map((r, idx) => {
          const distanceIcon = r.dist <= 50 ? '🏃‍♂️' : '🚶‍♂️';
          return `${distanceIcon} **${r.name || r.guildId}** — ${r.dist.toFixed(1)} km`;
        });
        
        embed.addFields({
          name: '🏛️ **Nearby Servers** (Quick Travel)',
          value: nearbyLines.join('\n') + (nearby.length > 8 ? `\n*...and ${nearby.length - 8} more nearby servers*` : ''),
          inline: false
        });
      }

      if (moderate.length > 0) {
        const moderateLines = moderate.slice(0, 5).map((r, idx) => {
          return `✈️ **${r.name || r.guildId}** — ${r.dist.toFixed(1)} km`;
        });
        
        embed.addFields({
          name: '🌍 **Distant Servers** (Moderate Journey)',
          value: moderateLines.join('\n') + (moderate.length > 5 ? `\n*...and ${moderate.length - 5} more distant servers*` : ''),
          inline: true
        });
      }

      if (distant.length > 0) {
        const distantLines = distant.slice(0, 5).map((r, idx) => {
          return `🚀 **${r.name || r.guildId}** — ${r.dist.toFixed(1)} km`;
        });
        
        embed.addFields({
          name: '🌌 **Far Servers** (Epic Journey)',
          value: distantLines.join('\n') + (distant.length > 5 ? `\n*...and ${distant.length - 5} more far servers*` : ''),
          inline: true
        });
      }

      // Add travel tips
      embed.addFields({
        name: '✈️ **Travel Tips**',
        value: '• Closer servers require less travel time\n• Premium users travel 3x faster\n• Travel costs stamina but opens new communities!\n• Use `/travel <server name>` to visit other servers',
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
