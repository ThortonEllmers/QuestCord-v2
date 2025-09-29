const os = require('os');

// Safe fetch helper
async function fetchSafe(...args) {
  try {
    if (typeof globalThis.fetch === 'function') {
      return globalThis.fetch(...args);
    }
    // Try to use node-fetch if available
    const fetch = require('node-fetch');
    return fetch(...args);
  } catch (error) {
    console.warn('Fetch not available:', error.message);
    return null;
  }
}

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1405273988615245885/Gnyfuy4TZDCwkCq3HeYLtZoh4uQj6kWdhmfHQV_CIhh9kx3gOSIKDl6kCVP3FH839K97';

/**
 * Send a message to Discord webhook - SAFE VERSION
 */
async function sendWebhookMessage(content, embeds = null, retries = 3) {
  try {
    if (!WEBHOOK_URL) return false;
    
    const payload = {
      content,
      username: 'QuestCord Bot Monitor',
      avatar_url: 'https://cdn.discordapp.com/app-icons/1404523107544469545/e3f7e9d4f9a5b2c8d1f3e6a9b2c5d8f1.png'
    };

    if (embeds) {
      payload.embeds = embeds;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetchSafe(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response) {
          return false;
        }

        if (response.ok) {
          return true;
        } else if (response.status === 429) {
          // Rate limited, wait and retry
          const retryAfter = response.headers.get('retry-after') || 1;
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        } else {
          return false;
        }
      } catch (error) {
        if (attempt === retries) return false;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Log bot startup to webhook - SAFE VERSION
 */
async function logBotStartup() {
  try {
    const startTime = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'production';
    const nodeVersion = process.version;
    const platform = `${os.type()} ${os.release()} (${os.arch()})`;
    
    const embed = {
      title: '🚀 QuestCord Bot Started',
      description: 'Bot has successfully initialized and is ready for adventures!',
      color: 0x00D26A,
      fields: [
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
      ],
      footer: {
        text: 'QuestCord System Monitor',
        icon_url: 'https://cdn.discordapp.com/app-icons/1404523107544469545/e3f7e9d4f9a5b2c8d1f3e6a9b2c5d8f1.png'
      },
      timestamp: startTime
    };

    await sendWebhookMessage(null, [embed]);
  } catch (error) {
    // Silently fail - don't break the bot
  }
}

/**
 * Log error to webhook - SAFE VERSION
 */
async function logError(error, context = null) {
  try {
    const errorTime = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'production';
    
    const errorName = error.name || 'Error';
    const errorMessage = error.message || 'No error message';
    const errorStack = error.stack || 'No stack trace available';
    
    const truncatedMessage = errorMessage.length > 1000 ? 
      errorMessage.substring(0, 1000) + '...' : errorMessage;
    
    const truncatedStack = errorStack.length > 1500 ? 
      errorStack.substring(0, 1500) + '...' : errorStack;

    const embed = {
      title: `❌ ${errorName}`,
      description: `\`\`\`${truncatedMessage}\`\`\``,
      color: 0xFF0000,
      fields: [
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
      ],
      footer: {
        text: 'QuestCord Error Monitor',
        icon_url: 'https://cdn.discordapp.com/app-icons/1404523107544469545/e3f7e9d4f9a5b2c8d1f3e6a9b2c5d8f1.png'
      },
      timestamp: errorTime
    };

    if (context) {
      embed.fields.push({
        name: '📍 Context',
        value: `\`${context}\``,
        inline: false
      });
    }

    if (truncatedStack !== 'No stack trace available') {
      embed.fields.push({
        name: '🔍 Stack Trace',
        value: `\`\`\`${truncatedStack}\`\`\``,
        inline: false
      });
    }

    await sendWebhookMessage(null, [embed]);
  } catch (error) {
    // Silently fail - don't break the bot
  }
}

/**
 * Log bot shutdown to webhook - SAFE VERSION
 */
async function logBotShutdown(reason = 'Unknown') {
  try {
    const shutdownTime = new Date().toISOString();
    const uptime = process.uptime();
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    
    const embed = {
      title: '🔴 QuestCord Bot Shutting Down',
      description: `Bot is shutting down: ${reason}`,
      color: 0xFF6B6B,
      fields: [
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
      ],
      footer: {
        text: 'QuestCord System Monitor',
        icon_url: 'https://cdn.discordapp.com/app-icons/1404523107544469545/e3f7e9d4f9a5b2c8d1f3e6a9b2c5d8f1.png'
      },
      timestamp: shutdownTime
    };

    await sendWebhookMessage(null, [embed]);
  } catch (error) {
    // Silently fail - don't break the bot
  }
}

/**
 * Log command error to webhook - SAFE VERSION
 */
async function logCommandError(commandName, userId, guildId, error) {
  try {
    const embed = {
      title: '⚠️ Command Error',
      description: `Error in command execution`,
      color: 0xFFA500,
      fields: [
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
      ],
      footer: {
        text: 'QuestCord Command Monitor',
        icon_url: 'https://cdn.discordapp.com/app-icons/1404523107544469545/e3f7e9d4f9a5b2c8d1f3e6a9b2c5d8f1.png'
      },
      timestamp: new Date().toISOString()
    };

    await sendWebhookMessage(null, [embed]);
  } catch (error) {
    // Silently fail - don't break the bot
  }
}

/**
 * Log admin panel action to webhook - SAFE VERSION
 */
async function logAdminAction(action, adminUserId, adminUsername, targetId, targetName, details = {}) {
  try {
    const embed = {
      title: '🛡️ Admin Panel Action',
      description: `Admin action performed`,
      color: 0x9B59B6,
      fields: [
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
      ],
      footer: {
        text: 'QuestCord Admin Monitor',
        icon_url: 'https://cdn.discordapp.com/app-icons/1404523107544469545/e3f7e9d4f9a5b2c8d1f3e6a9b2c5d8f1.png'
      },
      timestamp: new Date().toISOString()
    };

    if (targetId) {
      embed.fields.push({
        name: '🎯 Target',
        value: targetName ? `**${targetName}**\n\`${targetId}\`` : `\`${targetId}\``,
        inline: true
      });
    }

    if (Object.keys(details).length > 0) {
      const detailsText = Object.entries(details)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join('\n');
      
      embed.fields.push({
        name: '📋 Details',
        value: detailsText,
        inline: false
      });
    }

    await sendWebhookMessage(null, [embed]);
  } catch (error) {
    // Silently fail - don't break the bot
  }
}

module.exports = {
  sendWebhookMessage,
  logBotStartup,
  logError,
  logBotShutdown,
  logCommandError,
  logAdminAction
};