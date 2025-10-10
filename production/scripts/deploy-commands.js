require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
// Go up one directory from scripts/ to production/, then into src/commands
const dir = path.join(__dirname, '..', 'src', 'commands');
const cmdFiles = fs.readdirSync(dir).filter(f=>f.endsWith('.js') && !['_common.js','_guard.js'].includes(f));
for (const f of cmdFiles){
  const c = require(path.join(dir, f));
  if (c.data) commands.push(c.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const appId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

(async () => {
  try {
    // Fast per-guild registration
    const guildIds = new Set([
      process.env.SPAWN_GUILD_ID,
      process.env.ROLE_GUILD_ID,
      ...(process.env.COMMAND_GUILD_IDS ? process.env.COMMAND_GUILD_IDS.split(',').map(s=>s.trim()) : [])
    ].filter(Boolean));
    for (const gid of guildIds){
      console.log(`→ Putting guild commands for ${gid} ...`);
      await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
    }

    console.log('→ Putting GLOBAL commands (can take up to 1 hour to propagate)...');
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log('Done.');
  } catch (e){
    console.error(e);
    process.exitCode = 1;
  }
})();