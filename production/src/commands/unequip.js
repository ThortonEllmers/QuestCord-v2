const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const { isBanned, regenStamina } = require('./_guard');
const { getUserPrefix } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unequip')
    .setDescription('Unequip an item from a slot.')
    .addStringOption(o=>o.setName('slot').setDescription('Slot name (weapon/vehicle)').setRequired(true)),
  async execute(interaction){
    // Log command usage for live activity tracking
    logCommand(interaction.user.id, 'unequip', interaction.guild?.id);
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    if (isBanned(interaction.user.id)) return interaction.reply({ content: `${userPrefix} You are banned from using this bot.`, ephemeral: true });
    regenStamina(interaction.user.id);
    const slot = interaction.options.getString('slot');
    db.prepare('DELETE FROM equipment WHERE userId=? AND slot=?').run(interaction.user.id, slot);
    if (slot === 'vehicle'){
      // revert to default
      db.prepare('UPDATE players SET vehicle=? WHERE userId=?').run('on_foot', interaction.user.id);
    }
    const slotEmojis = {
      weapon: '⚔️',
      armor: '🛡️',
      vehicle: '🚗',
      accessory: '💍',
      tool: '🔨'
    };
    
    const slotEmoji = slotEmojis[slot] || '📦';
    
    const unequipEmbed = new EmbedBuilder()
      .setTitle(`${slotEmoji}✅ **ITEM UNEQUIPPED** ✅${slotEmoji}`)
      .setDescription(`Your ${slot} slot has been cleared`)
      .setColor(0x00AE86)
      .setAuthor({ 
        name: `${userPrefix} - Equipment Updated`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .addFields(
        {
          name: `${slotEmoji} **Slot Cleared**`,
          value: `**${slot.toUpperCase()}**\n📦 No item equipped`,
          inline: true
        },
        {
          name: '📊 **Status**',
          value: `✅ Successfully unequipped\n🎒 Item returned to inventory`,
          inline: true
        },
        {
          name: '🔄 **Next Steps**',
          value: `• Use \`/equip\` to equip new gear\n• Check \`/inventory\` for available items`,
          inline: true
        }
      )
      .setFooter({ 
        text: `Equipment management • QuestCord`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    return interaction.reply({ embeds: [unequipEmbed] });
  }
};
