const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');
const { tag, getUserPrefix } = require('../utils/roles');
const { isBanned, regenStamina } = require('./_guard');

module.exports = {
  data: new SlashCommandBuilder().setName('wallet').setDescription('Check your currency balance.'),
  async execute(interaction){
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'wallet', interaction.guild?.id);
    if (isBanned(interaction.user.id)) return interaction.reply({ content: 'You are banned from using this bot.', ephemeral: true });
    regenStamina(interaction.user.id);
    const userId = interaction.user.id;
    let row = db.prepare('SELECT * FROM players WHERE userId=?').get(userId);
    if (!row){
      db.prepare('INSERT INTO players(userId, name) VALUES(?,?)').run(userId, interaction.user.username);
      row = db.prepare('SELECT * FROM players WHERE userId=?').get(userId);
    }
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    
    // Get player stats for enhanced display
    const isPremiumUser = await tag(interaction.client, interaction.user, 'premium') === 'premium';
    
    // Calculate wealth status
    const balance = row.drakari;
    let wealthTier, wealthIcon, wealthColor;
    if (balance >= 100000) {
      wealthTier = 'LEGENDARY MAGNATE';
      wealthIcon = '👑';
      wealthColor = 0xFFD700;
    } else if (balance >= 50000) {
      wealthTier = 'WEALTHY MERCHANT';
      wealthIcon = '💎';
      wealthColor = 0x9B59B6;
    } else if (balance >= 25000) {
      wealthTier = 'PROSPEROUS TRADER';
      wealthIcon = '💰';
      wealthColor = 0x3498DB;
    } else if (balance >= 10000) {
      wealthTier = 'SUCCESSFUL ADVENTURER';
      wealthIcon = '🏆';
      wealthColor = 0x2ECC71;
    } else if (balance >= 5000) {
      wealthTier = 'RISING ENTREPRENEUR';
      wealthIcon = '⭐';
      wealthColor = 0xF39C12;
    } else if (balance >= 1000) {
      wealthTier = 'ASPIRING TRADER';
      wealthIcon = '🌟';
      wealthColor = 0xE67E22;
    } else {
      wealthTier = 'STARTING ADVENTURER';
      wealthIcon = '🔰';
      wealthColor = 0x95A5A6;
    }

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${userPrefix} Treasury`)
      .setDescription(`Your current financial status and wealth overview`)
      .setColor(isPremiumUser ? 0xFFD700 : wealthColor)
      .setAuthor({
        name: interaction.user.displayName,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
      .addFields(
        {
          name: `💵 Current Balance`,
          value: `**${balance.toLocaleString()} ${config.currencyName}**\n${wealthIcon} *${wealthTier}*`,
          inline: true
        },
        {
          name: '📈 Account Tier',
          value: isPremiumUser
            ? '**Premium Member** 🌟\n• Enhanced benefits\n• Exclusive access'
            : '**Standard Account**\n• Full features available\n• Upgrade to Premium',
          inline: true
        },
        {
          name: '🛠️ Quick Actions',
          value: '• `/market browse` - Shop items\n• `/market sell` - List items\n• `/travel` - Explore worlds',
          inline: true
        }
      );

    if (balance >= 10000) {
      embed.addFields({
        name: '📊 Financial Insights',
        value: `• **Portfolio Value:** ${balance.toLocaleString()} ${config.currencyName}\n• **Status:** Elite adventurer tier \n• **Recommendation:** Invest in legendary equipment\n• **Access:** Premium marketplace unlocked`,
        inline: false
      });
    } else if (balance >= 1000) {
      embed.addFields({
        name: '📈 Growth Opportunities',
        value: `• **Progress:** Well on your way to wealth!\n• **Next Goal:** Reach 10,000 ${config.currencyName}\n• **Tip:** Sell rare items on the market`,
        inline: false
      });
    } else {
      embed.addFields({
        name: '🌱 Getting Started',
        value: `• **Explore:** Use /travel to find loot\n• **Battle:** Fight bosses for rewards\n• **Trade:** Use the market system`,
        inline: false
      });
    }

    embed
      .setFooter({
        text: `QuestCord Treasury • Wealth builds adventures`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
