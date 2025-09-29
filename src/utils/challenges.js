const { db } = require('./store_sqlite');
const { awardGems } = require('./gems');

// Daily challenge definitions
const DAILY_CHALLENGES = {
  TRAVEL_SERVERS: {
    id: 'travel_servers',
    name: '🌍 World Explorer',
    description: 'Visit 3 different servers',
    target: 3,
    reward: { gems: 15, drakari: 5000 },
    type: 'daily'
  },
  
  BOSS_DAMAGE: {
    id: 'boss_damage',
    name: '⚔️ Damage Dealer',
    description: 'Deal 1,000 damage to bosses',
    target: 1000,
    reward: { gems: 20, drakari: 8000 },
    type: 'daily'
  },
  
  MARKET_TRADES: {
    id: 'market_trades',
    name: '💰 Merchant',
    description: 'Complete 2 market transactions',
    target: 2,
    reward: { gems: 10, drakari: 3000 },
    type: 'daily'
  },
  
  CRAFT_ITEMS: {
    id: 'craft_items',
    name: '🔨 Master Crafter',
    description: 'Craft 5 items',
    target: 5,
    reward: { gems: 12, drakari: 4000 },
    type: 'daily'
  },
  
  LOGIN_STREAK: {
    id: 'login_streak',
    name: '📅 Daily Dedication',
    description: 'Maintain your login streak',
    target: 1,
    reward: { gems: 8, drakari: 2000 },
    type: 'daily'
  }
};

// Weekly challenge definitions
const WEEKLY_CHALLENGES = {
  SERVER_EXPLORER: {
    id: 'server_explorer',
    name: '🗺️ Grand Explorer',
    description: 'Visit 15 different servers this week',
    target: 15,
    reward: { gems: 75, drakari: 25000 },
    type: 'weekly'
  },
  
  BOSS_HUNTER: {
    id: 'boss_hunter',
    name: '👹 Boss Hunter',
    description: 'Participate in 10 boss battles',
    target: 10,
    reward: { gems: 100, drakari: 35000 },
    type: 'weekly'
  },
  
  MARKET_MOGUL: {
    id: 'market_mogul',
    name: '📈 Trading Tycoon',
    description: 'Complete 15 market transactions',
    target: 15,
    reward: { gems: 60, drakari: 20000 },
    type: 'weekly'
  },
  
  CRAFTING_MASTER: {
    id: 'crafting_master',
    name: '⚒️ Production Expert',
    description: 'Craft 30 items this week',
    target: 30,
    reward: { gems: 80, drakari: 30000 },
    type: 'weekly'
  },
  
  SOCIAL_BUTTERFLY: {
    id: 'social_butterfly',
    name: '🦋 Community Champion',
    description: 'Travel 25 times this week',
    target: 25,
    reward: { gems: 65, drakari: 22000 },
    type: 'weekly'
  }
};

/**
 * Get the date key for challenges (YYYY-MM-DD for daily, YYYY-WW for weekly)
 */
function getDateKey(type = 'daily') {
  const now = new Date();
  
  if (type === 'weekly') {
    const year = now.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const weekNum = Math.ceil(((now - firstJan) / 86400000 + firstJan.getDay() + 1) / 7);
    return `${year}-W${weekNum.toString().padStart(2, '0')}`;
  }
  
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Initialize daily challenges for a user if they don't exist today
 */
function initializeDailyChallenges(userId) {
  try {
    const dateKey = getDateKey('daily');
    const existingChallenges = db.prepare('SELECT challengeId FROM daily_challenges WHERE userId = ? AND dateKey = ?').all(userId, dateKey);
    const existingIds = new Set(existingChallenges.map(c => c.challengeId));
    
    // Randomly select 3 daily challenges
    const allDailyIds = Object.keys(DAILY_CHALLENGES);
    const selectedChallenges = [];
    
    // Always include login streak
    selectedChallenges.push('login_streak');
    
    // Add 2 more random challenges
    const otherChallenges = allDailyIds.filter(id => id !== 'login_streak');
    while (selectedChallenges.length < 3 && otherChallenges.length > 0) {
      const randomIndex = Math.floor(Math.random() * otherChallenges.length);
      selectedChallenges.push(otherChallenges.splice(randomIndex, 1)[0]);
    }
    
    // Insert missing challenges
    for (const challengeId of selectedChallenges) {
      if (!existingIds.has(challengeId)) {
        const challenge = DAILY_CHALLENGES[challengeId.toUpperCase()];
        if (challenge) {
          db.prepare(`
            INSERT INTO daily_challenges (userId, challengeId, progress, target, completed, rewardClaimed, dateKey)
            VALUES (?, ?, 0, ?, 0, 0, ?)
          `).run(userId, challenge.id, challenge.target, dateKey);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[challenges] Error initializing daily challenges:', error.message);
    return false;
  }
}

/**
 * Initialize weekly challenges for a user if they don't exist this week
 */
function initializeWeeklyChallenges(userId) {
  try {
    const dateKey = getDateKey('weekly');
    const existingChallenges = db.prepare('SELECT challengeId FROM daily_challenges WHERE userId = ? AND dateKey = ?').all(userId, dateKey);
    const existingIds = new Set(existingChallenges.map(c => c.challengeId));
    
    // Randomly select 2 weekly challenges
    const allWeeklyIds = Object.keys(WEEKLY_CHALLENGES);
    const selectedChallenges = [];
    
    while (selectedChallenges.length < 2 && allWeeklyIds.length > 0) {
      const randomIndex = Math.floor(Math.random() * allWeeklyIds.length);
      selectedChallenges.push(allWeeklyIds.splice(randomIndex, 1)[0]);
    }
    
    // Insert missing challenges
    for (const challengeId of selectedChallenges) {
      if (!existingIds.has(challengeId)) {
        const challenge = WEEKLY_CHALLENGES[challengeId.toUpperCase()];
        if (challenge) {
          db.prepare(`
            INSERT INTO daily_challenges (userId, challengeId, progress, target, completed, rewardClaimed, dateKey)
            VALUES (?, ?, 0, ?, 0, 0, ?)
          `).run(userId, challenge.id, challenge.target, dateKey);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[challenges] Error initializing weekly challenges:', error.message);
    return false;
  }
}

/**
 * Update challenge progress
 */
function updateChallengeProgress(userId, challengeType, amount = 1) {
  try {
    const dailyDateKey = getDateKey('daily');
    const weeklyDateKey = getDateKey('weekly');
    
    // Update daily challenges
    const dailyUpdates = {
      'travel': ['travel_servers'],
      'boss_damage': ['boss_damage'],
      'market_trade': ['market_trades'],
      'craft': ['craft_items'],
      'login': ['login_streak']
    };
    
    // Update weekly challenges
    const weeklyUpdates = {
      'travel': ['server_explorer', 'social_butterfly'],
      'boss_fight': ['boss_hunter'],
      'market_trade': ['market_mogul'],
      'craft': ['crafting_master']
    };
    
    const relevantDailies = dailyUpdates[challengeType] || [];
    const relevantWeeklies = weeklyUpdates[challengeType] || [];
    
    // Update daily challenges
    for (const challengeId of relevantDailies) {
      db.prepare(`
        UPDATE daily_challenges 
        SET progress = MIN(progress + ?, target)
        WHERE userId = ? AND challengeId = ? AND dateKey = ? AND completed = 0
      `).run(amount, userId, challengeId, dailyDateKey);
      
      // Check if completed
      checkChallengeCompletion(userId, challengeId, dailyDateKey);
    }
    
    // Update weekly challenges
    for (const challengeId of relevantWeeklies) {
      db.prepare(`
        UPDATE daily_challenges 
        SET progress = MIN(progress + ?, target)
        WHERE userId = ? AND challengeId = ? AND dateKey = ? AND completed = 0
      `).run(amount, userId, challengeId, weeklyDateKey);
      
      // Check if completed
      checkChallengeCompletion(userId, challengeId, weeklyDateKey);
    }
    
    return true;
  } catch (error) {
    console.error('[challenges] Error updating challenge progress:', error.message);
    return false;
  }
}

/**
 * Check if a challenge is completed and award rewards
 */
function checkChallengeCompletion(userId, challengeId, dateKey) {
  try {
    const challenge = db.prepare(`
      SELECT progress, target, completed
      FROM daily_challenges
      WHERE userId = ? AND challengeId = ? AND dateKey = ?
    `).get(userId, challengeId, dateKey);
    
    if (!challenge || challenge.completed || challenge.progress < challenge.target) {
      return false;
    }
    
    // Mark as completed
    db.prepare(`
      UPDATE daily_challenges 
      SET completed = 1
      WHERE userId = ? AND challengeId = ? AND dateKey = ?
    `).run(userId, challengeId, dateKey);
    
    // Award rewards
    const challengeData = DAILY_CHALLENGES[challengeId.toUpperCase()] || WEEKLY_CHALLENGES[challengeId.toUpperCase()];
    if (challengeData) {
      if (challengeData.reward.gems > 0) {
        awardGems(userId, challengeData.reward.gems, 'challenge', `Completed: ${challengeData.name}`);
      }
      
      if (challengeData.reward.drakari > 0) {
        db.prepare('UPDATE players SET drakari = COALESCE(drakari, 0) + ? WHERE userId = ?')
          .run(challengeData.reward.drakari, userId);
      }
      
      console.log(`[challenges] ${userId} completed challenge: ${challengeData.name}`);
      return challengeData;
    }
    
    return false;
  } catch (error) {
    console.error('[challenges] Error checking challenge completion:', error.message);
    return false;
  }
}

/**
 * Get user's active challenges
 */
function getUserChallenges(userId) {
  try {
    // Initialize challenges if needed
    initializeDailyChallenges(userId);
    initializeWeeklyChallenges(userId);
    
    const dailyDateKey = getDateKey('daily');
    const weeklyDateKey = getDateKey('weekly');
    
    const challenges = db.prepare(`
      SELECT challengeId, progress, target, completed, rewardClaimed, dateKey
      FROM daily_challenges
      WHERE userId = ? AND (dateKey = ? OR dateKey = ?)
      ORDER BY dateKey DESC, challengeId
    `).all(userId, dailyDateKey, weeklyDateKey);
    
    return challenges.map(c => {
      const challengeData = DAILY_CHALLENGES[c.challengeId.toUpperCase()] || WEEKLY_CHALLENGES[c.challengeId.toUpperCase()];
      return {
        ...c,
        ...challengeData,
        type: c.dateKey.includes('W') ? 'weekly' : 'daily'
      };
    });
  } catch (error) {
    console.error('[challenges] Error getting user challenges:', error.message);
    return [];
  }
}

/**
 * Get challenge statistics
 */
function getChallengeStats(userId) {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalChallenges,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completedChallenges,
        COUNT(CASE WHEN dateKey LIKE '%-W%' THEN 1 END) as weeklyChallenges,
        COUNT(CASE WHEN dateKey NOT LIKE '%-W%' THEN 1 END) as dailyChallenges
      FROM daily_challenges
      WHERE userId = ?
    `).get(userId) || {};
    
    return {
      totalChallenges: stats.totalChallenges || 0,
      completedChallenges: stats.completedChallenges || 0,
      weeklyChallenges: stats.weeklyChallenges || 0,
      dailyChallenges: stats.dailyChallenges || 0,
      completionRate: stats.totalChallenges > 0 ? (stats.completedChallenges / stats.totalChallenges * 100) : 0
    };
  } catch (error) {
    console.error('[challenges] Error getting challenge stats:', error.message);
    return { totalChallenges: 0, completedChallenges: 0, weeklyChallenges: 0, dailyChallenges: 0, completionRate: 0 };
  }
}

module.exports = {
  DAILY_CHALLENGES,
  WEEKLY_CHALLENGES,
  initializeDailyChallenges,
  initializeWeeklyChallenges,
  updateChallengeProgress,
  checkChallengeCompletion,
  getUserChallenges,
  getChallengeStats
};