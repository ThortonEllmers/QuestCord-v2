const path = require('path');
// Load .env from the production directory (one level up from scripts/)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const { REST, Routes } = require('discord.js');
const logger = require('../src/utils/logger');

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
    // Fast per-guild registration - Always deploy to QuestCord server first
    const questcordGuildId = '1404523107544469545';
    logger.info(`→ Putting guild commands for QuestCord server (${questcordGuildId}) ...`);
    await rest.put(Routes.applicationGuildCommands(appId, questcordGuildId), { body: commands });
    logger.success(`✅ Commands deployed to QuestCord server!`);

    // Also deploy to other guilds if specified
    const guildIds = new Set([
      process.env.SPAWN_GUILD_ID,
      process.env.ROLE_GUILD_ID,
      ...(process.env.COMMAND_GUILD_IDS ? process.env.COMMAND_GUILD_IDS.split(',').map(s=>s.trim()) : [])
    ].filter(Boolean));

    // Remove QuestCord guild ID if it's already in the set to avoid duplicate deployment
    guildIds.delete(questcordGuildId);

    for (const gid of guildIds){
      logger.info(`→ Putting guild commands for ${gid} ...`);
      await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
    }

    logger.info('→ Putting GLOBAL commands (can take up to 1 hour to propagate)...');
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    logger.success('Done.');
  } catch (e){
    logger.error(e);
    process.exitCode = 1;
  }
})();