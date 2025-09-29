const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { db, logCommand } = require('../utils/store_sqlite');
const config = require('../utils/config');
const { getUserPrefix, isStaffOrDev } = require('../utils/roles');

function canonicalList(){
  const arr = Array.isArray(config.biomes) && config.biomes.length ? config.biomes : [
    'Volcanic','Ruins','Swamp','Water','Forest','Ice','Meadow','Mountain'
  ];
  return arr;
}
function biomeLabel(val){
  if (val == null) return 'Unknown';
  const arr = canonicalList();
  const lc = String(val).trim().toLowerCase();
  if (/^\d+$/.test(lc)){
    const n = parseInt(lc, 10);
    if (n >= 0 && n < arr.length) return arr[n];
    if (n >= 1 && n <= arr.length) return arr[n-1];
  }
  for (const name of arr){
    if (name.toLowerCase() === lc) return name;
  }
  return lc.charAt(0).toUpperCase() + lc.slice(1);
}
function normalize(b){
  if (!b) return null;
  return String(b).trim().toLowerCase();
}
function choices(){
  return canonicalList().map(v=>({ name: v, value: v.toLowerCase() }));
}
async function canChange(interaction){
  try{
    if (interaction.user?.id && interaction.guild?.ownerId && interaction.user.id === interaction.guild.ownerId) return true;
  }catch{}
  try{
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  }catch{}
  try{
    if (await isStaffOrDev(interaction.client, interaction.user.id)) return true;
  }catch{}
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('biome')
    .setDescription("View or change this server's biome")
    .addSubcommand(sc=>sc
      .setName('current')
      .setDescription("Show the current biome and remaining tokens"))
    .addSubcommand(sc=>sc
      .setName('change')
      .setDescription("Change the server's biome (consumes 1 token)")
      .addStringOption(o=>{
        o.setName('to').setDescription("Biome").setRequired(true);
        for (const c of choices()) o.addChoices(c);
        return o;
      })),
  async execute(interaction){
    const userPrefix = await getUserPrefix(interaction.client, interaction.user);
    const sub = interaction.options.getSubcommand();

    // Log command usage for live activity tracking
    logCommand(interaction.user.id, `biome ${sub}`, interaction.guild?.id);

    // Ensure default biome & tokens exist
    let s = db.prepare('SELECT biome, tokens FROM servers WHERE guildId=?').get(interaction.guild.id) || {};
    if (!s.biome){
      const arr = choices().map(c=>c.value);
      const pick = arr[Math.floor(Math.random()*arr.length)];
      db.prepare('UPDATE servers SET biome=?, tokens=COALESCE(tokens, 1) WHERE guildId=?')
        .run(pick, interaction.guild.id);
      s = { biome: pick, tokens: 1 };
    }

    if (sub === 'current'){
      const biomeName = biomeLabel(s.biome);
      const tokens = (s.tokens ?? 0);
      
      const biomeEmojis = {
        'volcanic': '🌋',
        'ruins': '🏛️',
        'swamp': '🐊',
        'water': '🌊', 
        'forest': '🌲',
        'ice': '❄️',
        'meadow': '🌻',
        'mountain': '⛰️'
      };
      
      const biomeEmoji = biomeEmojis[s.biome] || '🌍';
      const biomeDesc = {
        'volcanic': 'Molten lava flows and scorching heat',
        'ruins': 'Ancient structures filled with mystery', 
        'swamp': 'Murky waters and dangerous creatures',
        'water': 'Pristine oceans and aquatic life',
        'forest': 'Dense woodlands and wildlife',
        'ice': 'Frozen tundra and arctic conditions',
        'meadow': 'Rolling hills and peaceful grasslands',
        'mountain': 'Towering peaks and rocky terrain'
      }[s.biome] || 'Unknown environment';
      
      const currentEmbed = new EmbedBuilder()
        .setTitle(`${biomeEmoji}🌍 **SERVER BIOME** 🌍${biomeEmoji}`)
        .setDescription('✨ *The environmental setting of your server* ✨')
        .setColor(0x00AE86)
        .setAuthor({ 
          name: `${userPrefix} - Environmental Manager`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: `${biomeEmoji} **Current Biome**`,
            value: `**${biomeName}**\n${biomeDesc}`,
            inline: true
          },
          {
            name: '🪙 **Available Tokens**',
            value: `**${tokens.toLocaleString()}** tokens\n${tokens > 0 ? '✅ Can change biome' : '❌ Need more tokens'}`,
            inline: true
          },
          {
            name: '🔄 **Change Biome**',
            value: `Use \`/biome change\` to transform your server\nCost: 1 token per change`,
            inline: true
          }
        )
        .addFields({
          name: '🌟 **Available Biomes**',
          value: canonicalList().map(b => `${biomeEmojis[b.toLowerCase()] || '🌍'} **${b}**`).join(' • '),
          inline: false
        })
        .setFooter({ 
          text: `Transform your server's environment • QuestCord Biomes`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
        
      return interaction.reply({ embeds: [currentEmbed], ephemeral: true });
    }

    if (sub === 'change'){
      if (!(await canChange(interaction))){
        const permissionEmbed = new EmbedBuilder()
          .setTitle('🚫🔒 **ACCESS DENIED** 🔒🚫')
          .setDescription('Insufficient permissions to modify server biome')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix}`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields({
            name: '⚠️ **Required Permissions**',
            value: '• Server Owner\n• Administrator Role\n• QuestCord Staff/Developer',
            inline: false
          })
          .setFooter({ 
            text: `Contact an administrator for biome changes • QuestCord`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        return interaction.reply({ embeds: [permissionEmbed], ephemeral: true });
      }
      
      const tokens = (s.tokens ?? 0);
      if (tokens <= 0){
        const noTokensEmbed = new EmbedBuilder()
          .setTitle('🪙❌ **INSUFFICIENT TOKENS** ❌🪙')
          .setDescription('Your server needs tokens to change biomes')
          .setColor(0xFF6B6B)
          .setAuthor({ 
            name: `${userPrefix}`,
            iconURL: interaction.user.displayAvatarURL() 
          })
          .addFields(
            {
              name: '💰 **Current Balance**',
              value: `**${tokens}** tokens`,
              inline: true
            },
            {
              name: '💸 **Cost**',
              value: `**1** token per change`,
              inline: true
            },
            {
              name: '🛒 **Get Tokens**',
              value: `Use \`/tokens buy\` to purchase more`,
              inline: true
            }
          )
          .setFooter({ 
            text: `Visit the token store to continue customizing • QuestCord`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        return interaction.reply({ embeds: [noTokensEmbed], ephemeral: true });
      }
      
      const to = normalize(interaction.options.getString('to'));
      const valid = new Set(choices().map(c=>c.value));
      if (!valid.has(to)){
        return interaction.reply({ content: `${userPrefix} That biome is not valid.`, ephemeral: true });
      }
      
      const oldBiome = biomeLabel(s.biome);
      const newBiome = biomeLabel(to);
      
      db.prepare('UPDATE servers SET biome=?, tokens = tokens - 1 WHERE guildId=?').run(to, interaction.guild.id);
      const left = db.prepare('SELECT tokens FROM servers WHERE guildId=?').get(interaction.guild.id)?.tokens ?? 0;
      
      const biomeEmojis = {
        'volcanic': '🌋',
        'ruins': '🏛️',
        'swamp': '🐊',
        'water': '🌊', 
        'forest': '🌲',
        'ice': '❄️',
        'meadow': '🌻',
        'mountain': '⛰️'
      };
      
      const oldEmoji = biomeEmojis[s.biome] || '🌍';
      const newEmoji = biomeEmojis[to] || '🌍';
      
      const successEmbed = new EmbedBuilder()
        .setTitle('🌍✨ **BIOME TRANSFORMATION COMPLETE** ✨🌍')
        .setDescription('🎉 *Your server has been transformed!* 🎉')
        .setColor(0x00D26A)
        .setAuthor({ 
          name: `${userPrefix} - Environmental Architect`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .addFields(
          {
            name: `${oldEmoji} **Previous Biome**`,
            value: `**${oldBiome}**\n🕰️ Former environment`,
            inline: true
          },
          {
            name: `${newEmoji} **New Biome**`, 
            value: `**${newBiome}**\n✨ Current environment`,
            inline: true
          },
          {
            name: '🪙 **Tokens Remaining**',
            value: `**${left.toLocaleString()}** tokens\n💎 Available for future changes`,
            inline: true
          }
        )
        .addFields({
          name: '🌟 **Transformation Effects**',
          value: `• Server environment updated\n• New atmospheric conditions\n• Enhanced server aesthetics\n• Ready for new visitors!`,
          inline: false
        })
        .setFooter({ 
          text: `Biome transformation successful • QuestCord Environmental System`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
        
      return interaction.reply({ embeds: [successEmbed], ephemeral: false });
    }
  }
};
