const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');
const { getUserPrefix, isDev } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('Server tokens')
    .addSubcommand(sc=>sc
      .setName('buy')
      .setDescription('Where to buy more tokens'))
    .addSubcommand(sc=>sc
      .setName('balance')
      .setDescription("Show this server's token balance"))
    .addSubcommand(sc=>sc
      .setName('add')
      .setDescription('Add tokens to a server (Developer only)')
      .addIntegerOption(o=>o.setName('amount').setDescription('Number of tokens to add').setRequired(true))
      .addStringOption(o=>o.setName('serverid').setDescription('Target server ID (defaults to this server)').setRequired(false))
    )
    .addSubcommand(sc=>sc
      .setName('remove')
      .setDescription('Remove tokens from a server (Developer only)')
      .addIntegerOption(o=>o.setName('amount').setDescription('Number of tokens to remove').setRequired(true))
      .addStringOption(o=>o.setName('serverid').setDescription('Target server ID (defaults to this server)').setRequired(false))
    ),
  async execute(interaction){
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    const sub = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `tokens ${sub}`, interaction.guild?.id);

    if (sub === 'buy'){
      const url = (config?.billing && config.billing.checkoutUrl) ||
                  (config?.biome && config.biome.purchaseUrl) ||
                  (config?.premium && config.premium.purchaseUrl) || null;
      
      if (url){
        const embed = new EmbedBuilder()
          .setTitle('🪙💎 **TOKEN MARKETPLACE** 💎🪙')
          .setDescription('🏪 *Unlock premium server features with official QuestCord tokens* ⚡')
          .setColor(0xFFD700)
          .setAuthor({ 
            name: `${userPrefix} - Token Merchant`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '🛒 **Purchase Methods**',
              value: `🌐 [Visit Web Store](${require('../utils/config')?.web?.publicBaseUrl || ''}/store?guildId=${interaction.guild?.id || ''})\n🔗 [Direct Purchase](${url})`,
              inline: true
            },
            {
              name: '💳 **Payment Options**',
              value: '• Credit/Debit Cards\n• PayPal & Digital Wallets\n• Cryptocurrency (select)\n• Bank Transfer',
              inline: true
            },
            {
              name: '⚡ **Instant Delivery**',
              value: '• Tokens credited immediately\n• Automatic server notification\n• Receipt via email\n• 24/7 support available',
              inline: true
            },
            {
              name: '🎯 **Token Applications**',
              value: '🌍 **Biome Changes** - Transform your server environment\n📍 **Server Relocation** - Move to new regions\n🎨 **Premium Customization** - Exclusive features\n🚀 **Advanced Tools** - Enhanced server management\n💎 **Special Events** - Exclusive access',
              inline: false
            },
            {
              name: '🎁 **Bundle Offers**',
              value: '• **Starter Pack** - 5 tokens + bonus features\n• **Growth Bundle** - 15 tokens + premium perks\n• **Enterprise** - 50 tokens + priority support\n• **Bulk Discount** - Save 20% on 100+ tokens',
              inline: false
            }
          )
          .setFooter({ 
            text: `💎 Secure payments • Instant delivery • Premium support • QuestCord Marketplace`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('🚫 Store Unavailable')
          .setDescription('Token purchases are not currently available')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix}`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields({
            name: '⚠️ Notice',
            value: 'The token store is temporarily unavailable. Please try again later.',
            inline: false
          })
          .setFooter({ 
            text: `Contact support if you need assistance • QuestCord`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    if (sub === 'balance'){
      const row = db.prepare('SELECT tokens FROM servers WHERE guildId=?').get(interaction.guild.id) || {};
      const n = row.tokens ?? 0;
      
      // Determine wealth tier based on token count
      let balanceTier, balanceIcon, balanceColor;
      if (n >= 100) {
        balanceTier = 'ENTERPRISE ACCOUNT';
        balanceIcon = '👑';
        balanceColor = 0xFFD700;
      } else if (n >= 50) {
        balanceTier = 'PREMIUM TREASURY';
        balanceIcon = '💎';
        balanceColor = 0x9B59B6;
      } else if (n >= 25) {
        balanceTier = 'ADVANCED WALLET';
        balanceIcon = '🏆';
        balanceColor = 0x3498DB;
      } else if (n >= 10) {
        balanceTier = 'ESTABLISHED ACCOUNT';
        balanceIcon = '⭐';
        balanceColor = 0x2ECC71;
      } else if (n >= 5) {
        balanceTier = 'GROWING TREASURY';
        balanceIcon = '🌟';
        balanceColor = 0xF39C12;
      } else if (n >= 1) {
        balanceTier = 'STARTER ACCOUNT';
        balanceIcon = '🔰';
        balanceColor = 0x00AE86;
      } else {
        balanceTier = 'EMPTY TREASURY';
        balanceIcon = '📭';
        balanceColor = 0x95A5A6;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${balanceIcon}🪙 **SERVER TOKEN TREASURY** 🪙${balanceIcon}`)
        .setDescription('💰 *Your server\'s premium currency for exclusive features* ⚡')
        .setColor(balanceColor)
        .setAuthor({ 
          name: `${userPrefix} - ${balanceTier}`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: '💳 **Current Balance**',
            value: `**${n.toLocaleString()}** tokens\n${balanceIcon} ${balanceTier}`,
            inline: true
          },
          {
            name: '📊 **Account Status**',
            value: n > 0 ? 
              `✅ **Active Treasury**\nReady for premium features` :
              `📭 **Empty Treasury**\nTokens needed for features`,
            inline: true
          },
          {
            name: '🚀 **Quick Actions**',
            value: n > 0 ?
              '🌍 Change biome\n📍 Relocate server\n🎨 Customize server' :
              '🛒 Purchase tokens\n💰 Fund treasury\n🔓 Unlock features',
            inline: true
          }
        );

      if (n > 0) {
        embed.addFields({
          name: '💎 **Available Features**',
          value: `• **Biome Changes** (1 token each)\n• **Server Relocation** (varies by distance)\n• **Premium Customization** (1-5 tokens)\n• **Special Events** (seasonal pricing)\n• **Advanced Tools** (varies by feature)`,
          inline: false
        });
      } else {
        embed.addFields({
          name: '🛒 **Get Started**',
          value: `• Use \`/tokens buy\` to purchase\n• Visit the web store for bundles\n• Start with the **Starter Pack** (5 tokens)\n• Unlock amazing server features!`,
          inline: false
        });
      }

      embed
        .setFooter({ 
          text: `🏪 Use /tokens buy to purchase more tokens • QuestCord Treasury`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'add'){
      if (!await isDev(interaction.client, interaction.user.id)){
        return interaction.reply({ content: `${userPrefix} Only **Developers** can add tokens.`, ephemeral: true });
      }
      const amt = interaction.options.getInteger('amount');
      const n = Math.max(1, (amt|0));
      const gid = (interaction.options.getString('serverid') || interaction.guild?.id || '').trim();
      if (!gid) return interaction.reply({ content: `${userPrefix} Missing server ID.`, ephemeral: true });
      const exists = db.prepare('SELECT 1 FROM servers WHERE guildId=?').get(gid);
      if (!exists){
        return interaction.reply({ content: `${userPrefix} Server not found: \`${gid}\``, ephemeral: true });
      }
      db.prepare('UPDATE servers SET tokens = COALESCE(tokens,0) + ? WHERE guildId=?').run(n, gid);
      const after = db.prepare('SELECT tokens FROM servers WHERE guildId=?').get(gid)?.tokens ?? 0;
      return interaction.reply({ content: `${userPrefix} Added **${n}** token(s) to \`${gid}\`. New balance: **${after}**.`, ephemeral: false });
    }

    if (sub === 'remove'){
      if (!await isDev(interaction.client, interaction.user.id)){
        return interaction.reply({ content: `${userPrefix} Only **Developers** can remove tokens.`, ephemeral: true });
      }
      const amt = interaction.options.getInteger('amount');
      const n = Math.max(1, (amt|0));
      const gid = (interaction.options.getString('serverid') || interaction.guild?.id || '').trim();
      if (!gid) return interaction.reply({ content: `${userPrefix} Missing server ID.`, ephemeral: true });

      const exists = db.prepare('SELECT 1 FROM servers WHERE guildId=?').get(gid);
      if (!exists){
        return interaction.reply({ content: `${userPrefix} Server not found: \`${gid}\``, ephemeral: true });
      }

      db.prepare('UPDATE servers SET tokens = MAX(0, COALESCE(tokens,0) - ?) WHERE guildId=?').run(n, gid);
      const after = db.prepare('SELECT tokens FROM servers WHERE guildId=?').get(gid)?.tokens ?? 0;
      return interaction.reply({ content: `${userPrefix} Removed **${n}** token(s) from \`${gid}\`. New balance: **${after}**.`, ephemeral: false });
    }
  }
};
