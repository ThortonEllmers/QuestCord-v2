const { db } = require('./store_sqlite');

// Gem earning rates
const GEM_RATES = {
  DAILY_LOGIN_BASE: 1,
  DAILY_LOGIN_STREAK_BONUS: 1, // +1 per day of streak up to 7
  BOSS_PARTICIPATION_MIN: 5,
  BOSS_PARTICIPATION_MAX: 15,
  MARKET_TRADING_PER_1K: 1, // 1 gem per 1000 drakari traded
  SERVER_VISIT: 2, // gems for visiting new server
  CHALLENGE_COMPLETION: 5,
};

// Gem shop prices
const GEM_SHOP = {
  PREMIUM_1_DAY: 50,
  PREMIUM_7_DAY: 300,
  PREMIUM_30_DAY: 1000,
  INDIVIDUAL_FEATURE_1_DAY: 10,
  INDIVIDUAL_FEATURE_3_DAY: 25,
  INDIVIDUAL_FEATURE_7_DAY: 50
};

/**
 * Award gems to a user and log the transaction
 */
function awardGems(userId, amount, type, description) {
  try {
    // Add gems to player
    db.prepare('UPDATE players SET gems = COALESCE(gems, 0) + ? WHERE userId = ?').run(amount, userId);
    
    // Log transaction
    db.prepare(`
      INSERT INTO gem_transactions (userId, amount, type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, amount, type, description, Date.now());
    
    console.log(`[gems] Awarded ${amount} gems to ${userId} for ${type}: ${description}`);
    return true;
  } catch (error) {
    console.error('[gems] Error awarding gems:', error.message);
    return false;
  }
}

/**
 * Spend gems from a user
 */
function spendGems(userId, amount, type, description) {
  try {
    const player = db.prepare('SELECT gems FROM players WHERE userId = ?').get(userId);
    if (!player || (player.gems || 0) < amount) {
      return false; // Not enough gems
    }
    
    // Deduct gems
    db.prepare('UPDATE players SET gems = gems - ? WHERE userId = ?').run(amount, userId);
    
    // Log transaction
    db.prepare(`
      INSERT INTO gem_transactions (userId, amount, type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, -amount, type, description, Date.now());
    
    console.log(`[gems] Deducted ${amount} gems from ${userId} for ${type}: ${description}`);
    return true;
  } catch (error) {
    console.error('[gems] Error spending gems:', error.message);
    return false;
  }
}

/**
 * Get user's gem balance
 */
function getGemBalance(userId) {
  try {
    const player = db.prepare('SELECT gems FROM players WHERE userId = ?').get(userId);
    return player?.gems || 0;
  } catch (error) {
    console.error('[gems] Error getting gem balance:', error.message);
    return 0;
  }
}

/**
 * Admin function to remove gems (can go below 0)
 */
function removeGems(userId, amount, type, description) {
  try {
    // Remove gems (allowing negative balance for admin purposes)
    db.prepare('UPDATE players SET gems = MAX(0, COALESCE(gems, 0) - ?) WHERE userId = ?').run(amount, userId);
    
    // Log transaction
    db.prepare(`
      INSERT INTO gem_transactions (userId, amount, type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, -amount, type, description, Date.now());
    
    console.log(`[gems] Admin removed ${amount} gems from ${userId} for ${type}: ${description}`);
    return true;
  } catch (error) {
    console.error('[gems] Error removing gems:', error.message);
    return false;
  }
}

/**
 * Log a gems transaction
 */
function logGemsTransaction(userId, amount, type, metadata = {}) {
  try {
    const description = metadata.reason || type;
    db.prepare(`
      INSERT INTO gem_transactions (userId, amount, type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, amount, type, description, Date.now());
    return true;
  } catch (error) {
    console.error('[gems] Error logging transaction:', error.message);
    return false;
  }
}

/**
 * Handle daily login streak and award gems
 */
function handleDailyLogin(userId) {
  try {
    const player = db.prepare('SELECT loginStreak, lastLoginAt, gems FROM players WHERE userId = ?').get(userId) || {};
    const now = Date.now();
    const today = new Date(now).toDateString();
    const lastLogin = player.lastLoginAt ? new Date(player.lastLoginAt).toDateString() : null;
    
    // Check if already logged in today
    if (lastLogin === today) {
      return { alreadyLoggedToday: true, streak: player.loginStreak || 0 };
    }
    
    let newStreak = 1;
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toDateString();
    
    // Continue streak if logged in yesterday
    if (lastLogin === yesterday) {
      newStreak = Math.min(7, (player.loginStreak || 0) + 1); // Cap at 7 days
    }
    
    // Calculate gems to award
    const baseGems = GEM_RATES.DAILY_LOGIN_BASE;
    const bonusGems = Math.min(newStreak - 1, 6) * GEM_RATES.DAILY_LOGIN_STREAK_BONUS;
    const totalGems = baseGems + bonusGems;
    
    // Update player
    db.prepare(`
      UPDATE players 
      SET loginStreak = ?, lastLoginAt = ?, gems = COALESCE(gems, 0) + ?
      WHERE userId = ?
    `).run(newStreak, now, totalGems, userId);
    
    // Log transaction
    db.prepare(`
      INSERT INTO gem_transactions (userId, amount, type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, totalGems, 'daily_login', `Day ${newStreak} login streak`, now);
    
    // Update login challenge progress (avoid circular dependency)
    try {
      const challenges = require('./challenges');
      challenges.updateChallengeProgress(userId, 'login', 1);
    } catch (e) {
      console.warn('[gems] Failed to update challenge progress for login:', e.message);
    }
    
    return {
      alreadyLoggedToday: false,
      streak: newStreak,
      gemsAwarded: totalGems,
      baseGems,
      bonusGems
    };
  } catch (error) {
    console.error('[gems] Error handling daily login:', error.message);
    return { error: true };
  }
}

/**
 * Award gems for boss participation based on damage dealt
 */
function awardBossParticipationGems(userId, damageDealt, totalBossHealth) {
  try {
    // Calculate gems based on contribution (5-15 gems)
    const contribution = Math.min(1, damageDealt / (totalBossHealth * 0.1)); // 10% = max contribution
    const gems = Math.floor(GEM_RATES.BOSS_PARTICIPATION_MIN + 
                           (contribution * (GEM_RATES.BOSS_PARTICIPATION_MAX - GEM_RATES.BOSS_PARTICIPATION_MIN)));
    
    return awardGems(userId, gems, 'boss_participation', `Dealt ${damageDealt} damage to boss`);
  } catch (error) {
    console.error('[gems] Error awarding boss participation gems:', error.message);
    return false;
  }
}

/**
 * Award gems for market trading milestones
 */
function awardTradingGems(userId, amountTraded) {
  try {
    const gems = Math.floor(amountTraded / 1000) * GEM_RATES.MARKET_TRADING_PER_1K;
    if (gems > 0) {
      return awardGems(userId, gems, 'market_trading', `Traded ${amountTraded.toLocaleString()} drakari`);
    }
    return true;
  } catch (error) {
    console.error('[gems] Error awarding trading gems:', error.message);
    return false;
  }
}

/**
 * Award gems for visiting new server
 */
function awardServerVisitGems(userId, serverName) {
  return awardGems(userId, GEM_RATES.SERVER_VISIT, 'server_visit', `Visited ${serverName}`);
}

/**
 * Get gem transaction history for a user
 */
function getGemHistory(userId, limit = 10) {
  try {
    return db.prepare(`
      SELECT amount, type, description, timestamp
      FROM gem_transactions
      WHERE userId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(userId, limit);
  } catch (error) {
    console.error('[gems] Error getting gem history:', error.message);
    return [];
  }
}

module.exports = {
  GEM_RATES,
  GEM_SHOP,
  awardGems,
  spendGems,
  removeGems,
  getGemBalance,
  handleDailyLogin,
  awardBossParticipationGems,
  awardTradingGems,
  awardServerVisitGems,
  getGemHistory,
  logGemsTransaction
};