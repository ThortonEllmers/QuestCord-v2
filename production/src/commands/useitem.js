const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { itemByNameOrId } = require('../utils/items');
const { isBanned, regenStamina } = require('./_guard');
const { getUserPrefix, isPremium } = require('../utils/roles');

function applyEffects(userId, effects){
  const p = db.prepare('SELECT health, stamina FROM players WHERE userId=?').get(userId) || { health: 100, stamina: 100 };
  let health = p.health, stamina = p.stamina;
  if (!effects) return { health, stamina };
  for (const [k,v] of Object.entries(effects)){
    if (k === 'health'){
      const n = parseInt(String(v).replace('+',''),10) || 0;
      health = Math.min(100, Math.max(0, health + n));
    }
    if (k === 'stamina'){
      const n = parseInt(String(v).replace('+',''),10) || 0;
      stamina = Math.min(100, Math.max(0, stamina + n));
    }
  }
  db.prepare('UPDATE players SET health=?, stamina=?, staminaUpdatedAt=? WHERE userId=?').run(health, stamina, Date.now(), userId);
  return { health, stamina };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('useitem')
    .setDescription('Use a consumable from your inventory.')
    .addStringOption(o=>o.setName('item').setDescription('Item id or exact name').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('How many to use').setRequired(false)),
  async execute(interaction){
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'useitem', interaction.guild?.id);
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    regenStamina(interaction.user.id);
    const q = interaction.options.getString('item');
    const amt = Math.max(1, interaction.options.getInteger('amount') || 1);
    const item = itemByNameOrId(q);
    if (!item) return interaction.reply({ content: `${userPrefix} Unknown item.`, ephemeral: true });
    if (item.premiumNeeded && !(await isPremium(interaction.client, interaction.user.id))){
      return interaction.reply({ content: `${userPrefix} This item is for Premium users only.`, ephemeral: true });
    }
    if (!item.consumable) return interaction.reply({ content: `${userPrefix} That item is not consumable.`, ephemeral: true });
    const inv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(interaction.user.id, item.id);
    if (!inv || inv.qty < amt) return interaction.reply({ content: `${userPrefix} You do not have enough of that item.`, ephemeral: true });
    db.prepare('UPDATE inventory SET qty=qty-? WHERE userId=? AND itemId=?').run(amt, interaction.user.id, item.id);
    db.prepare('DELETE FROM inventory WHERE userId=? AND itemId=? AND qty<=0').run(interaction.user.id, item.id);
    for (let i=0;i<amt;i++) applyEffects(interaction.user.id, item.effects);
    const p = db.prepare('SELECT health, stamina FROM players WHERE userId=?').get(interaction.user.id);
    
    // Calculate health and stamina bars
    const healthBar = '█'.repeat(Math.floor(p.health/5)) + '░'.repeat(20 - Math.floor(p.health/5));
    const staminaBar = '█'.repeat(Math.floor(p.stamina/5)) + '░'.repeat(20 - Math.floor(p.stamina/5));
    
    // Determine rarity color and effects
    const rarityColors = {
      'common': 0x95A5A6,
      'uncommon': 0x2ECC71,
      'rare': 0x3498DB,
      'epic': 0x9B59B6,
      'legendary': 0xF39C12,
      'mythic': 0xE74C3C,
      'transcendent': 0xFFD700
    };
    const itemColor = rarityColors[item.rarity] || 0x00AE86;
    
    // Calculate total effects
    let totalHealthGain = 0;
    let totalStaminaGain = 0;
    if (item.effects) {
      if (item.effects.health) totalHealthGain = (parseInt(String(item.effects.health).replace('+',''),10) || 0) * amt;
      if (item.effects.stamina) totalStaminaGain = (parseInt(String(item.effects.stamina).replace('+',''),10) || 0) * amt;
    }

    const embed = new EmbedBuilder()
      .setTitle('🧪⚡ **ITEM CONSUMED** ⚡🧪')
      .setDescription(`💫 *The ${item.name} courses through your body with ${item.rarity} power* ✨`)
      .setColor(itemColor)
      .setAuthor({ 
        name: `${userPrefix} - Alchemist`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .addFields(
        {
          name: '🍯 **Consumed Item**',
          value: `**${item.name}** × ${amt}\n💎 ${item.rarity} quality\n${item.premiumNeeded ? '👑 Premium item' : '⭐ Standard item'}`,
          inline: true
        },
        {
          name: '📊 **Immediate Effects**',
          value: totalHealthGain > 0 && totalStaminaGain > 0 ? 
            `💚 **+${totalHealthGain}** Health\n💙 **+${totalStaminaGain}** Stamina` :
            totalHealthGain > 0 ? `💚 **+${totalHealthGain}** Health` :
            totalStaminaGain > 0 ? `💙 **+${totalStaminaGain}** Stamina` :
            '✨ Special effects applied',
          inline: true
        },
        {
          name: '⏱️ **Usage Time**',
          value: `**${new Date().toLocaleTimeString()}**\n🕐 Effects active now`,
          inline: true
        },
        {
          name: '❤️ **Health Status**',
          value: `\`${healthBar}\`\n**${p.health}**/100 HP (${p.health}%)`,
          inline: false
        },
        {
          name: '💨 **Stamina Status**',
          value: `\`${staminaBar}\`\n**${p.stamina}**/100 Stamina (${p.stamina}%)`,
          inline: false
        }
      );

    // Add detailed effects information if available
    if (item.effects) {
      const effectsDetails = Object.entries(item.effects).map(([key, value]) => {
        const effectIcon = {
          'health': '❤️',
          'stamina': '💨',
          'damage': '⚔️',
          'defense': '🛡️',
          'speed': '⚡'
        }[key.toLowerCase()] || '✨';
        
        return `${effectIcon} **${key.charAt(0).toUpperCase() + key.slice(1)}:** ${value} per use`;
      }).join('\n');
      
      embed.addFields({
        name: '🔮 **Alchemical Properties**',
        value: effectsDetails + `\n\n📈 **Total Applied:** All effects × ${amt}`,
        inline: false
      });
    }

    if (item.description) {
      embed.addFields({
        name: '📖 **Item Lore**',
        value: item.description,
        inline: false
      });
    }

    // Get remaining inventory count
    const remainingInv = db.prepare('SELECT qty FROM inventory WHERE userId=? AND itemId=?').get(interaction.user.id, item.id);
    const remainingCount = remainingInv?.qty || 0;
    
    embed.addFields({
      name: '🎒 **Inventory Update**',
      value: remainingCount > 0 ? 
        `📦 **${remainingCount}** remaining in inventory\n✅ Ready for future use` :
        '📭 **None remaining** in inventory\n🛒 Consider restocking at the market',
      inline: false
    });

    embed.setFooter({ 
      text: `🧪 Alchemy mastered through practice • QuestCord Consumables`,
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
