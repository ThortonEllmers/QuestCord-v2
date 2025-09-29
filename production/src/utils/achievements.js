const { db } = require('./store_sqlite');
const { awardGems } = require('./gems');

// Achievement definitions
const ACHIEVEMENTS = {
  FIRST_TRAVEL: {
    id: 'first_travel',
    name: 'Globe Trotter',
    description: 'Complete your first travel to another server',
    reward: { gems: 10, premiumTime: 0 },
    icon: 'AIRPLANE'
  },
  
  VISIT_5_SERVERS: {
    id: 'visit_5_servers', 
    name: 'Explorer',
    description: 'Visit 5 different servers',
    reward: { gems: 25, premiumTime: 24 }, // 1-day premium trial
    icon: 'COMPASS'
  },
  
  VISIT_25_SERVERS: {
    id: 'visit_25_servers',
    name: 'World Traveler', 
    description: 'Visit 25 different servers',
    reward: { gems: 50, premiumTime: 72 }, // 3-day premium trial
    icon: 'GLOBE'
  },
  
  FIRST_BOSS_KILL: {
    id: 'first_boss_kill',
    name: 'Boss Slayer',
    description: 'Participate in defeating your first boss',
    reward: { gems: 15, premiumTime: 24 }, // 1-day premium trial
    icon: 'DEMON'
  },
  
  BOSS_KILLER_10: {
    id: 'boss_killer_10',
    name: 'Monster Hunter',
    description: 'Participate in defeating 10 bosses',
    reward: { gems: 40, premiumTime: 72 }, // 3-day premium trial
    icon: 'BOW'
  },
  
  BOSS_KILLER_50: {
    id: 'boss_killer_50', 
    name: 'Legendary Warrior',
    description: 'Participate in defeating 50 bosses',
    reward: { gems: 100, premiumTime: 168 }, // 7-day premium trial
    icon: 'LIGHTNING'
  },
  
  CRAFT_MASTER: {
    id: 'craft_master',
    name: 'Master Crafter',
    description: 'Craft 100 items',
    reward: { gems: 75, premiumTime: 72 }, // 3-day premium trial
    icon: 'HAMMER'
  },
  
  MILLIONAIRE: {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Accumulate 1,000,000 Drakari',
    reward: { gems: 150, premiumTime: 168 }, // 7-day premium trial
    icon: 'DIAMOND'
  },
  
  MARKET_TRADER: {
    id: 'market_trader',
    name: 'Market Mogul',
    description: 'Complete 100 market transactions',
    reward: { gems: 60, premiumTime: 48 }, // 2-day premium trial
    icon: 'CHART'
  },
  
  DAILY_GRINDER: {
    id: 'daily_grinder',
    name: 'Daily Grinder',
    description: 'Maintain a 7-day login streak',
    reward: { gems: 35, premiumTime: 24 }, // 1-day premium trial
    icon: 'CALENDAR'
  },
  
  SOCIAL_BUTTERFLY: {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Visit 10 different servers in one week',
    reward: { gems: 45, premiumTime: 48 }, // 2-day premium trial
    icon: 'GROUP'
  },
  
  EQUIPMENT_COLLECTOR: {
    id: 'equipment_collector',
    name: 'Equipment Collector',
    description: 'Own 50 different weapons or armor pieces',
    reward: { gems: 55, premiumTime: 48 }, // 2-day premium trial  
    icon: 'SHIELD'
  }
};

/**
 * Check and award achievement if conditions are met
 */
function checkAchievement(userId, achievementId) {
  try {
    // Check if already unlocked
    const existing = db.prepare('SELECT id FROM achievements WHERE userId = ? AND achievementId = ?')
      .get(userId, achievementId);
    
    if (existing) {
      return false; // Already unlocked
    }
    
    const achievement = ACHIEVEMENTS[achievementId.toUpperCase()];
    if (!achievement) {
      return false; // Invalid achievement
    }
    
    // Award achievement
    db.prepare(`
      INSERT INTO achievements (userId, achievementId, unlockedAt, rewardClaimed)
      VALUES (?, ?, ?, 0)
    `).run(userId, achievement.id, Date.now());
    
    // Award gems
    awardGems(userId, achievement.reward.gems, 'achievement', `Unlocked: ${achievement.name}`);
    
    // Award premium time if applicable
    if (achievement.reward.premiumTime > 0) {
      // Note: Premium time implementation would go here
      // For now, we'll just log it
      console.log(`[achievements] ${userId} earned ${achievement.reward.premiumTime}h premium time`);
    }
    
    console.log(`[achievements] ${userId} unlocked achievement: ${achievement.name}`);
    return achievement;
  } catch (error) {
    console.error('[achievements] Error checking achievement:', error.message);
    return false;
  }
}

/**
 * Check travel-related achievements
 */
function checkTravelAchievements(userId) {
  try {
    // Get player data with proper null handling
    const player = db.prepare('SELECT serversVisited FROM players WHERE userId = ?').get(userId);
    if (!player) {
      console.warn(`[achievements] Player ${userId} not found for travel achievements`);
      return;
    }
    
    const serversVisited = parseInt(player.serversVisited) || 0;
    
    // Only award achievements for positive, realistic values
    if (serversVisited <= 0 || serversVisited > 1000) {
      return; // Invalid or unrealistic server count
    }
    
    // Check various travel milestones - only trigger on exact counts to prevent multiple awards
    if (serversVisited === 1) {
      checkAchievement(userId, 'FIRST_TRAVEL');
    } else if (serversVisited === 5) {
      checkAchievement(userId, 'VISIT_5_SERVERS');
    } else if (serversVisited === 25) {
      checkAchievement(userId, 'VISIT_25_SERVERS');
    }
    
    // Check weekly social butterfly (10 servers in 7 days) - only if travel_history table exists
    try {
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentTravels = db.prepare(`
        SELECT COUNT(DISTINCT toGuildId) as count
        FROM travel_history 
        WHERE userId = ? AND timestamp > ?
      `).get(userId, weekAgo);
      
      if (recentTravels?.count >= 10) {
        checkAchievement(userId, 'SOCIAL_BUTTERFLY');
      }
    } catch (e) {
      // travel_history table might not exist yet, ignore
      console.debug('[achievements] travel_history table not available for social butterfly check');
    }
    
  } catch (error) {
    console.error('[achievements] Error checking travel achievements:', error.message);
  }
}

/**
 * Check boss-related achievements  
 */
function checkBossAchievements(userId) {
  try {
    const player = db.prepare('SELECT bossKills FROM players WHERE userId = ?').get(userId);
    if (!player) {
      console.warn(`[achievements] Player ${userId} not found for boss achievements`);
      return;
    }
    
    const bossKills = parseInt(player.bossKills) || 0;
    
    // Only award achievements for positive, realistic values
    if (bossKills <= 0 || bossKills > 10000) {
      return; // Invalid or unrealistic boss kill count
    }
    
    // Check various boss kill milestones - only trigger on exact counts
    if (bossKills === 1) {
      checkAchievement(userId, 'FIRST_BOSS_KILL');
    } else if (bossKills === 10) {
      checkAchievement(userId, 'BOSS_KILLER_10');
    } else if (bossKills === 50) {
      checkAchievement(userId, 'BOSS_KILLER_50');
    }
  } catch (error) {
    console.error('[achievements] Error checking boss achievements:', error.message);
  }
}

/**
 * Check crafting achievements
 */
function checkCraftingAchievements(userId) {
  try {
    const player = db.prepare('SELECT itemsCrafted FROM players WHERE userId = ?').get(userId);
    const itemsCrafted = player?.itemsCrafted || 0;
    
    if (itemsCrafted === 100) {
      checkAchievement(userId, 'CRAFT_MASTER');
    }
  } catch (error) {
    console.error('[achievements] Error checking crafting achievements:', error.message);
  }
}

/**
 * Check wealth achievements
 */
function checkWealthAchievements(userId) {
  try {
    const player = db.prepare('SELECT drakari FROM players WHERE userId = ?').get(userId);
    const drakari = player?.drakari || 0;
    
    if (drakari >= 1000000) {
      checkAchievement(userId, 'MILLIONAIRE');
    }
  } catch (error) {
    console.error('[achievements] Error checking wealth achievements:', error.message);
  }
}

/**
 * Check login streak achievements
 */
function checkLoginAchievements(userId) {
  try {
    const player = db.prepare('SELECT loginStreak FROM players WHERE userId = ?').get(userId);
    const loginStreak = player?.loginStreak || 0;
    
    if (loginStreak >= 7) {
      checkAchievement(userId, 'DAILY_GRINDER');
    }
  } catch (error) {
    console.error('[achievements] Error checking login achievements:', error.message);
  }
}

/**
 * Get user's achievements
 */
function getUserAchievements(userId, includeUnclaimed = true) {
  try {
    let query = `
      SELECT achievementId, unlockedAt, rewardClaimed
      FROM achievements
      WHERE userId = ?
    `;
    
    if (!includeUnclaimed) {
      query += ' AND rewardClaimed = 0';
    }
    
    const userAchievements = db.prepare(query + ' ORDER BY unlockedAt DESC').all(userId);
    
    return userAchievements.map(ua => ({
      ...ACHIEVEMENTS[ua.achievementId.toUpperCase()],
      unlockedAt: ua.unlockedAt,
      rewardClaimed: ua.rewardClaimed
    })).filter(a => a.id); // Filter out invalid achievements
  } catch (error) {
    console.error('[achievements] Error getting user achievements:', error.message);
    return [];
  }
}

/**
 * Get achievement progress for display
 */
function getAchievementProgress(userId) {
  try {
    const player = db.prepare(`
      SELECT serversVisited, bossKills, itemsCrafted, drakari, loginStreak
      FROM players WHERE userId = ?
    `).get(userId) || {};
    
    const inventory = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE userId = ?').get(userId);
    const equipmentCount = inventory?.count || 0;
    
    const marketTrades = db.prepare(`
      SELECT COUNT(*) as count FROM market_listings 
      WHERE sellerId = ? AND soldAt IS NOT NULL
    `).get(userId);
    const marketTradeCount = marketTrades?.count || 0;
    
    return {
      serversVisited: player.serversVisited || 0,
      bossKills: player.bossKills || 0, 
      itemsCrafted: player.itemsCrafted || 0,
      drakari: player.drakari || 0,
      loginStreak: player.loginStreak || 0,
      equipmentCount,
      marketTradeCount
    };
  } catch (error) {
    console.error('[achievements] Error getting achievement progress:', error.message);
    return {};
  }
}

module.exports = {
  ACHIEVEMENTS,
  checkAchievement,
  checkTravelAchievements,
  checkBossAchievements,
  checkCraftingAchievements,
  checkWealthAchievements,
  checkLoginAchievements,
  getUserAchievements,
  getAchievementProgress
};