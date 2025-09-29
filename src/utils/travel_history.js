const { db } = require('./store_sqlite');
const { awardServerVisitGems } = require('./gems');
const { checkTravelAchievements } = require('./achievements');

/**
 * Record a completed travel in the history
 */
function recordTravel(userId, fromGuildId, toGuildId, travelTime) {
  try {
    // Get server names
    const fromServer = fromGuildId ? db.prepare('SELECT name FROM servers WHERE guildId = ?').get(fromGuildId) : null;
    const toServer = db.prepare('SELECT name FROM servers WHERE guildId = ?').get(toGuildId);
    
    const fromServerName = fromServer?.name || fromGuildId;
    const toServerName = toServer?.name || toGuildId;
    
    // Record the travel
    db.prepare(`
      INSERT INTO travel_history (userId, fromGuildId, toGuildId, fromServerName, toServerName, travelTime, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, fromGuildId, toGuildId, fromServerName, toServerName, travelTime, Date.now());
    
    // Update player's total servers visited count
    const visitedBefore = db.prepare('SELECT COUNT(*) as count FROM travel_history WHERE userId = ? AND toGuildId = ?').get(userId, toGuildId);
    if (visitedBefore.count === 1) { // First time visiting this server
      db.prepare('UPDATE players SET serversVisited = COALESCE(serversVisited, 0) + 1 WHERE userId = ?').run(userId);
      
      // Award gems for visiting new server
      awardServerVisitGems(userId, toServerName);
    }
    
    // Check travel achievements
    checkTravelAchievements(userId);
    
    // Update challenge progress (avoid circular dependency)
    try {
      const challenges = require('./challenges');
      challenges.updateChallengeProgress(userId, 'travel', 1);
    } catch (e) {
      console.warn('[travel_history] Failed to update challenge progress:', e.message);
    }
    
    console.log(`[travel_history] Recorded travel for ${userId}: ${fromServerName || 'Unknown'} -> ${toServerName}`);
    return true;
  } catch (error) {
    console.error('[travel_history] Error recording travel:', error.message);
    return false;
  }
}

/**
 * Get travel history for a user
 */
function getTravelHistory(userId, limit = 10) {
  try {
    return db.prepare(`
      SELECT fromGuildId, toGuildId, fromServerName, toServerName, travelTime, timestamp
      FROM travel_history
      WHERE userId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(userId, limit);
  } catch (error) {
    console.error('[travel_history] Error getting travel history:', error.message);
    return [];
  }
}

/**
 * Get travel statistics for a user
 */
function getTravelStats(userId) {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalTravels,
        COUNT(DISTINCT toGuildId) as uniqueServersVisited,
        SUM(travelTime) as totalTravelTime,
        AVG(travelTime) as avgTravelTime
      FROM travel_history
      WHERE userId = ?
    `).get(userId) || {};
    
    // Get most visited servers
    const topServers = db.prepare(`
      SELECT toServerName, toGuildId, COUNT(*) as visits
      FROM travel_history
      WHERE userId = ?
      GROUP BY toGuildId
      ORDER BY visits DESC
      LIMIT 5
    `).all(userId);
    
    // Get recent travel activity (last 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentActivity = db.prepare(`
      SELECT COUNT(*) as recentTravels
      FROM travel_history
      WHERE userId = ? AND timestamp > ?
    `).get(userId, weekAgo) || {};
    
    return {
      totalTravels: stats.totalTravels || 0,
      uniqueServersVisited: stats.uniqueServersVisited || 0,
      totalTravelTime: stats.totalTravelTime || 0,
      avgTravelTime: Math.round(stats.avgTravelTime || 0),
      topServers,
      recentTravels: recentActivity.recentTravels || 0
    };
  } catch (error) {
    console.error('[travel_history] Error getting travel stats:', error.message);
    return {
      totalTravels: 0,
      uniqueServersVisited: 0,
      totalTravelTime: 0,
      avgTravelTime: 0,
      topServers: [],
      recentTravels: 0
    };
  }
}

module.exports = {
  recordTravel,
  getTravelHistory,
  getTravelStats
};