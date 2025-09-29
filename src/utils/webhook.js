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
 * Send a message to Discord webhook
 */
async function sendWebhookMessage(content, embeds = null, retries = 3) {
  if (!WEBHOOK_URL) return false;
  
  // Don't let webhook failures crash the bot
  try {
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
          console.warn('Webhook failed: fetch not available');
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
          console.warn(`Webhook failed with status ${response.status}: ${response.statusText}`);
          return false;
        }
      } catch (error) {
        console.warn(`Webhook attempt ${attempt} failed:`, error.message);
        if (attempt === retries) return false;
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    return false;
  } catch (webhookError) {
    console.warn('Webhook system error:', webhookError.message);
    return false;
  }
}

/**
 * Log bot startup to webhook
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
    color: 0x00D26A, // Green
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
}

/**
 * Log error to webhook
 */
async function logError(error, context = null) {
  const errorTime = new Date().toISOString();
  const environment = process.env.NODE_ENV || 'production';
  
  // Extract error details
  const errorName = error.name || 'Error';
  const errorMessage = error.message || 'No error message';
  const errorStack = error.stack || 'No stack trace available';
  
  // Truncate long messages
  const truncatedMessage = errorMessage.length > 1000 ? 
    errorMessage.substring(0, 1000) + '...' : errorMessage;
  
  const truncatedStack = errorStack.length > 1500 ? 
    errorStack.substring(0, 1500) + '...' : errorStack;

  const embed = {
    title: `❌ ${errorName}`,
    description: `\`\`\`${truncatedMessage}\`\`\``,
    color: 0xFF0000, // Red
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

  // Add context if provided
  if (context) {
    embed.fields.push({
      name: '📍 Context',
      value: `\`${context}\``,
      inline: false
    });
  }

  // Add stack trace if available
  if (truncatedStack !== 'No stack trace available') {
    embed.fields.push({
      name: '🔍 Stack Trace',
      value: `\`\`\`${truncatedStack}\`\`\``,
      inline: false
    });
  }

  await sendWebhookMessage(null, [embed]);
}

/**
 * Log bot shutdown to webhook
 */
async function logBotShutdown(reason = 'Unknown') {
  const shutdownTime = new Date().toISOString();
  const uptime = process.uptime();
  const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
  
  const embed = {
    title: '🔴 QuestCord Bot Shutting Down',
    description: `Bot is shutting down: ${reason}`,
    color: 0xFF6B6B, // Red-orange
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
}

/**
 * Log command error to webhook
 */
async function logCommandError(commandName, userId, guildId, error) {
  const embed = {
    title: '⚠️ Command Error',
    description: `Error in command execution`,
    color: 0xFFA500, // Orange
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
}

/**
 * Log admin panel action to webhook
 */
async function logAdminAction(action, adminUserId, adminUsername, targetId, targetName, details = {}) {
  const embed = {
    title: '🛡️ Admin Panel Action',
    description: `Admin action performed`,
    color: 0x9B59B6, // Purple
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

  // Add target information if provided
  if (targetId) {
    embed.fields.push({
      name: '🎯 Target',
      value: targetName ? `**${targetName}**\n\`${targetId}\`` : `\`${targetId}\``,
      inline: true
    });
  }

  // Add additional details if provided
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
}

module.exports = {
  sendWebhookMessage,
  logBotStartup,
  logError,
  logBotShutdown,
  logCommandError,
  logAdminAction
};