/**
 * BOT NOTIFICATION SYSTEM
 * =======================
 * Direct bot posting system that replaces webhooks
 * All notifications are sent directly through the Discord bot
 *
 * This system provides centralized notification handling with:
 * - Direct Discord bot message posting (no webhooks)
 * - Automatic retry logic with exponential backoff
 * - Graceful error handling
 * - Support for embeds and formatted messages
 */

const os = require('os');
const logger = require('./logger');

// Discord bot client reference (will be set during bot initialization)
let discordClient = null;

// Notification channels
const CHANNELS = {
  MONITOR: '1405273988615245885',    // Bot monitoring channel
  SECURITY: '1404555278594342993'     // Security alerts channel
};

/**
 * Initialize the notification system with Discord client
 * @param {Client} client - Discord.js client instance
 */
function initializeBotNotifications(client) {
  discordClient = client;
  logger.info('[BotNotifications] Notification system initialized with Discord client');
}

/**
 * Send a message to a Discord channel via bot
 * @param {string} channelId - Discord channel ID
 * @param {Object} options - Message options (content, embeds, etc.)
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<boolean>} Success status
 */
async function sendChannelMessage(channelId, options, retries = 3) {
  if (!discordClient) {
    console.warn('[BotNotifications] Discord client not initialized');
    return false;
  }

  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const channel = await discordClient.channels.fetch(channelId).catch(() => null);

        if (!channel || !channel.isTextBased()) {
          console.warn('[BotNotifications] Channel not found or not text-based: %s', channelId);
          return false;
        }

        await channel.send(options);
        return true;
      } catch (error) {
        if (error.code === 50013) {
          // Missing permissions - don't retry
          console.warn('[BotNotifications] Missing permissions for channel %s', channelId);
          return false;
        }

        if (error.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = error.retry_after || (1000 * attempt);
          console.warn('[BotNotifications] Rate limited, waiting %dms', retryAfter);
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          continue;
        }

        if (attempt === retries) {
          throw error;
        }

        // Exponential backoff for other errors
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    return false;
  } catch (error) {
    console.error('[BotNotifications] Failed to send message:', error.message);
    return false;
  }
}

/**
 * Log bot startup notification
 */
async function logBotStartup() {
  try {
    if (!discordClient) {
      console.warn('[BotNotifications] Cannot send startup notification - client not ready');
      return;
    }

    const { EmbedBuilder } = require('discord.js');
    const startTime = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'production';
    const nodeVersion = process.version;
    const platform = `${os.type()} ${os.release()} (${os.arch()})`;

    const embed = new EmbedBuilder()
      .setTitle('🚀 QuestCord Bot Started')
      .setDescription('Bot has successfully initialized and is ready for adventures!')
      .setColor(0x00D26A) // Green
      .addFields(
        {
          name: '📅 Startup Time',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        },
        {
          name: '🌍 Environment',
          value: environment.toUpperCase(),
          inline: true
        },
        {
          name: '🖥️ Platform',
          value: platform,
          inline: true
        },
        {
          name: '🟢 Node.js Version',
          value: nodeVersion,
          inline: true
        },
        {
          name: '⚡ Process ID',
          value: `${process.pid}`,
          inline: true
        },
        {
          name: '💾 Memory Usage',
          value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          inline: true
        }
      )
      .setFooter({
        text: 'QuestCord System Monitor',
        iconURL: discordClient.user.displayAvatarURL()
      })
      .setTimestamp();

    await sendChannelMessage(CHANNELS.MONITOR, { embeds: [embed] });
    logger.info('[BotNotifications] Startup notification sent');
  } catch (error) {
    console.error('[BotNotifications] Failed to send startup notification:', error.message);
  }
}

/**
 * Log error notification
 * @param {Error} error - Error object
 * @param {string} context - Error context
 */
async function logError(error, context = null) {
  try {
    if (!discordClient) {
      return;
    }

    const { EmbedBuilder } = require('discord.js');
    const errorTime = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'production';

    const errorName = error.name || 'Error';
    const errorMessage = error.message || 'No error message';
    const errorStack = error.stack || 'No stack trace available';

    const truncatedMessage = errorMessage.length > 1000 ?
      errorMessage.substring(0, 1000) + '...' : errorMessage;

    const truncatedStack = errorStack.length > 1500 ?
      errorStack.substring(0, 1500) + '...' : errorStack;

    const embed = new EmbedBuilder()
      .setTitle(`❌ ${errorName}`)
      .setDescription(`\`\`\`${truncatedMessage}\`\`\``)
      .setColor(0xFF0000) // Red
      .addFields(
        {
          name: '📅 Error Time',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        },
        {
          name: '🌍 Environment',
          value: environment.toUpperCase(),
          inline: true
        }
      )
      .setFooter({
        text: 'QuestCord Error Monitor',
        iconURL: discordClient.user.displayAvatarURL()
      })
      .setTimestamp();

    if (context) {
      embed.addFields({
        name: '📍 Context',
        value: `\`${context}\``,
        inline: false
      });
    }

    if (truncatedStack !== 'No stack trace available') {
      embed.addFields({
        name: '🔍 Stack Trace',
        value: `\`\`\`${truncatedStack}\`\`\``,
        inline: false
      });
    }

    await sendChannelMessage(CHANNELS.MONITOR, { embeds: [embed] });
  } catch (notifError) {
    console.error('[BotNotifications] Failed to send error notification:', notifError.message);
  }
}

/**
 * Log bot shutdown notification
 * @param {string} reason - Shutdown reason
 */
async function logBotShutdown(reason = 'Unknown') {
  try {
    if (!discordClient) {
      return;
    }

    const { EmbedBuilder } = require('discord.js');
    const shutdownTime = new Date().toISOString();
    const uptime = process.uptime();
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

    const embed = new EmbedBuilder()
      .setTitle('🔴 QuestCord Bot Shutting Down')
      .setDescription(`Bot is shutting down: ${reason}`)
      .setColor(0xFF6B6B) // Red-orange
      .addFields(
        {
          name: '📅 Shutdown Time',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        },
        {
          name: '⏱️ Uptime',
          value: uptimeFormatted,
          inline: true
        },
        {
          name: '📝 Reason',
          value: reason,
          inline: true
        }
      )
      .setFooter({
        text: 'QuestCord System Monitor',
        iconURL: discordClient.user.displayAvatarURL()
      })
      .setTimestamp();

    await sendChannelMessage(CHANNELS.MONITOR, { embeds: [embed] });
  } catch (error) {
    console.error('[BotNotifications] Failed to send shutdown notification:', error.message);
  }
}

/**
 * Log command error notification
 * @param {string} commandName - Command name
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Error} error - Error object
 */
async function logCommandError(commandName, userId, guildId, error) {
  try {
    if (!discordClient) {
      return;
    }

    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Command Error')
      .setDescription('Error in command execution')
      .setColor(0xFFA500) // Orange
      .addFields(
        {
          name: '🎮 Command',
          value: `\`/${commandName}\``,
          inline: true
        },
        {
          name: '👤 User ID',
          value: `\`${userId}\``,
          inline: true
        },
        {
          name: '🏠 Guild ID',
          value: guildId ? `\`${guildId}\`` : 'DM',
          inline: true
        },
        {
          name: '❌ Error',
          value: `\`\`\`${error.message || error}\`\`\``,
          inline: false
        }
      )
      .setFooter({
        text: 'QuestCord Command Monitor',
        iconURL: discordClient.user.displayAvatarURL()
      })
      .setTimestamp();

    await sendChannelMessage(CHANNELS.MONITOR, { embeds: [embed] });
  } catch (notifError) {
    console.error('[BotNotifications] Failed to send command error notification:', notifError.message);
  }
}

/**
 * Log admin panel action notification
 * @param {string} action - Action performed
 * @param {string} adminUserId - Admin user ID
 * @param {string} adminUsername - Admin username
 * @param {string} targetId - Target ID
 * @param {string} targetName - Target name
 * @param {Object} details - Additional details
 */
async function logAdminAction(action, adminUserId, adminUsername, targetId, targetName, details = {}) {
  try {
    if (!discordClient) {
      return;
    }

    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Admin Panel Action')
      .setDescription('Admin action performed')
      .setColor(0x9B59B6) // Purple
      .addFields(
        {
          name: '👤 Admin User',
          value: `**${adminUsername || 'Unknown'}**\n\`${adminUserId}\``,
          inline: true
        },
        {
          name: '🎯 Action',
          value: `\`${action}\``,
          inline: true
        },
        {
          name: '📅 Timestamp',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        }
      )
      .setFooter({
        text: 'QuestCord Admin Monitor',
        iconURL: discordClient.user.displayAvatarURL()
      })
      .setTimestamp();

    if (targetId) {
      embed.addFields({
        name: '🎯 Target',
        value: targetName ? `**${targetName}**\n\`${targetId}\`` : `\`${targetId}\``,
        inline: true
      });
    }

    if (Object.keys(details).length > 0) {
      const detailsText = Object.entries(details)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join('\n');

      embed.addFields({
        name: '📋 Details',
        value: detailsText,
        inline: false
      });
    }

    await sendChannelMessage(CHANNELS.MONITOR, { embeds: [embed] });
  } catch (error) {
    console.error('[BotNotifications] Failed to send admin action notification:', error.message);
  }
}

/**
 * Get the Discord client (for external use)
 * @returns {Client|null} Discord client instance
 */
function getDiscordClient() {
  return discordClient;
}

module.exports = {
  initializeBotNotifications,
  logBotStartup,
  logError,
  logBotShutdown,
  logCommandError,
  logAdminAction,
  getDiscordClient,
  CHANNELS
};
