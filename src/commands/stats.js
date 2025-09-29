const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPrefix, isPremium } = require('../utils/roles');
const { logCommand } = require('../utils/store_sqlite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('💪 View your character\'s health, stamina, and current status')
    .addBooleanOption(o => o.setName('public').setDescription('🌐 Share your stats with everyone in the channel')),

  async execute(interaction) {
    const { db } = require('../utils/store_sqlite');
    const { MAX_H, MAX_S, applyRegenForUser } = require('../utils/regen');

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'stats', interaction.guild?.id);

    const userId = interaction.user.id;
    try { applyRegenForUser(userId); } catch {}

    try { db.prepare("ALTER TABLE players ADD COLUMN isPremium INTEGER DEFAULT 0").run(); } catch {}

    const row = db.prepare("SELECT health, stamina, isPremium FROM players WHERE userId=?").get(userId) || { health: 0, stamina: 0, isPremium: 0 };
    const userIsPremium = (await isPremium(interaction.client, userId)) || row.isPremium;

    const maxH = userIsPremium ? MAX_H * 1.5 : MAX_H;
    const maxS = MAX_S;

    const bar = (v, m) => {
      const pct = m ? Math.round((v/m)*100) : 0;
      const ticks = Math.max(0, Math.min(10, Math.round((pct/100)*10)));
      const filledBar = '█'.repeat(ticks);
      const emptyBar = '▒'.repeat(10 - ticks);
      return `\`${filledBar}${emptyBar}\` **${Math.round(v)}/${Math.round(m)}** (${pct}%)`;
    };

    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    
    const embed = new EmbedBuilder()
      .setTitle(`💪 ${userPrefix} Character Stats`)
      .setDescription('View your current health, stamina, and status information')
      .setColor(userIsPremium ? 0xFFD700 : 0x5865F2)
      .setAuthor({
        name: interaction.user.displayName,
        iconURL: interaction.user.displayAvatarURL()
      })
      .addFields(
        {
          name: '❤️ Health Status',
          value: `${bar(row.health || 0, maxH)}\n**Regeneration:** ${userIsPremium ? '2x faster' : 'Standard rate'}`,
          inline: false
        },
        {
          name: '⚡ Stamina Level',
          value: `${bar(row.stamina || 0, maxS)}\n**Usage:** Required for travel and combat`,
          inline: false
        },
        {
          name: '🌟 Account Status',
          value: userIsPremium ?
            '**Premium Member** \n• 1.5x health capacity\n• Faster regeneration\n• Priority features' :
            '**Standard Account**\n• Base health capacity\n• Standard regeneration\n• All core features',
          inline: true
        },
        {
          name: '📊 Quick Actions',
          value: '• `/travel` - Explore servers\n• `/inventory` - Check items\n• `/market browse` - Buy equipment',
          inline: true
        }
      )
      .setFooter({
        text: 'QuestCord • Stats auto-regenerate over time',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    const pub = interaction.options.getBoolean('public') || false;
    await interaction.reply({ embeds: [embed], ephemeral: !pub });
  }
};
