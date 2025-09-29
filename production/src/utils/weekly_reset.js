/**
 * Weekly Reset Utility for QuestCord
 *
 * This module handles the weekly reset functionality that occurs every Monday at 12:00 AM.
 * It resets live leaderboards, clears weekly statistics, and maintains data freshness.
 */

const { db } = require('./store_sqlite');
const logger = require('./logger');

/**
 * Calculate the next Monday at 12:00 AM
 * @returns {Date} Next Monday at midnight
 */
function getNextMondayMidnight() {
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7; // Monday is day 1, Sunday is 0
    const nextMonday = new Date(now);

    // If it's already Monday, get next Monday if we've passed midnight
    if (daysUntilMonday === 0 && now.getHours() >= 0) {
        nextMonday.setDate(now.getDate() + 7);
    } else {
        nextMonday.setDate(now.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
    }

    // Set to midnight
    nextMonday.setHours(0, 0, 0, 0);

    return nextMonday;
}

/**
 * Check if it's Monday 12:00 AM (within 1 minute window)
 * @returns {boolean} True if it's time for weekly reset
 */
function isWeeklyResetTime() {
    const now = new Date();
    return now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0;
}

/**
 * Perform the weekly reset operations
 */
async function performWeeklyReset() {
    try {
        logger.info('[weekly-reset] Starting weekly reset process...');

        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const resetTimestamp = Date.now();

        // Reset leaderboard data (keep only current week)
        logger.info('[weekly-reset] Cleaning old travel history...');
        const travelResult = db.prepare('DELETE FROM travel_history WHERE timestamp < ?').run(oneWeekAgo);
        logger.info(`[weekly-reset] Removed ${travelResult.changes} old travel records`);

        // Clean old weather events (delete encounters first due to foreign key constraint)
        logger.info('[weekly-reset] Cleaning expired weather events...');

        // First, get expired weather event IDs
        const expiredEvents = db.prepare('SELECT id FROM weather_events WHERE endTime < ?').all(resetTimestamp);
        logger.info(`[weekly-reset] Found ${expiredEvents.length} expired weather events`);

        // Delete weather encounters for each expired event individually to avoid FK constraint issues
        let totalEncountersRemoved = 0;
        for (const event of expiredEvents) {
          try {
            const encounterResult = db.prepare('DELETE FROM weather_encounters WHERE weatherEventId = ?').run(event.id);
            totalEncountersRemoved += encounterResult.changes;
          } catch (error) {
            logger.warn(`[weekly-reset] Failed to delete encounters for weather event ${event.id}:`, error.message);
          }
        }
        logger.info(`[weekly-reset] Removed ${totalEncountersRemoved} weather encounters`);

        // Then delete the expired weather events
        const weatherResult = db.prepare('DELETE FROM weather_events WHERE endTime < ?').run(resetTimestamp);
        logger.info(`[weekly-reset] Removed ${weatherResult.changes} expired weather events`);

        // Reset any weekly statistics or achievements
        logger.info('[weekly-reset] Resetting weekly player statistics...');

        // Create a weekly reset log entry
        try {
            db.prepare(`
                INSERT OR REPLACE INTO weekly_resets (week_start, reset_timestamp, items_reset)
                VALUES (?, ?, ?)
            `).run(
                getWeekStart().getTime(),
                resetTimestamp,
                JSON.stringify({
                    travel_records: travelResult.changes,
                    weather_events: weatherResult.changes,
                    weather_encounters: totalEncountersRemoved
                })
            );
        } catch (error) {
            // Table might not exist, create it
            db.prepare(`
                CREATE TABLE IF NOT EXISTS weekly_resets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    week_start INTEGER NOT NULL,
                    reset_timestamp INTEGER NOT NULL,
                    items_reset TEXT
                )
            `).run();

            db.prepare(`
                INSERT INTO weekly_resets (week_start, reset_timestamp, items_reset)
                VALUES (?, ?, ?)
            `).run(
                getWeekStart().getTime(),
                resetTimestamp,
                JSON.stringify({
                    travel_records: travelResult.changes,
                    weather_events: weatherResult.changes,
                    weather_encounters: totalEncountersRemoved
                })
            );
        }

        logger.info('[weekly-reset] Weekly reset completed successfully');
        return true;

    } catch (error) {
        logger.error('[weekly-reset] Error during weekly reset:', error);
        return false;
    }
}

/**
 * Get the start of the current week (Monday 00:00)
 * @returns {Date} Start of current week
 */
function getWeekStart() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, Monday = 1

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToSubtract);
    weekStart.setHours(0, 0, 0, 0);

    return weekStart;
}

/**
 * Get milliseconds until next weekly reset
 * @returns {number} Milliseconds until next Monday 12:00 AM
 */
function getTimeUntilNextReset() {
    const now = new Date();
    const nextReset = getNextMondayMidnight();
    return nextReset.getTime() - now.getTime();
}

/**
 * Initialize the weekly reset scheduler
 * This should be called when the bot starts
 */
function initializeWeeklyReset() {
    logger.info('[weekly-reset] Initializing weekly reset scheduler...');

    // Check if we need to perform an immediate reset (if we missed it while offline)
    const lastReset = getLastResetTime();
    const currentWeekStart = getWeekStart().getTime();

    if (!lastReset || lastReset < currentWeekStart) {
        logger.info('[weekly-reset] Performing missed weekly reset...');
        performWeeklyReset();
    }

    // Schedule the next reset
    scheduleNextReset();
}

/**
 * Get the timestamp of the last weekly reset
 * @returns {number|null} Timestamp of last reset, or null if none found
 */
function getLastResetTime() {
    try {
        const result = db.prepare('SELECT reset_timestamp FROM weekly_resets ORDER BY reset_timestamp DESC LIMIT 1').get();
        return result ? result.reset_timestamp : null;
    } catch (error) {
        // Table might not exist yet
        return null;
    }
}

/**
 * Schedule the next weekly reset
 */
function scheduleNextReset() {
    const timeUntilReset = getTimeUntilNextReset();
    const nextResetDate = new Date(Date.now() + timeUntilReset);

    logger.info(`[weekly-reset] Next reset scheduled for: ${nextResetDate.toISOString()}`);

    setTimeout(() => {
        performWeeklyReset();
        scheduleNextReset(); // Schedule the next one
    }, timeUntilReset);
}

/**
 * Get current week statistics for API endpoints
 * @returns {Object} Current week data boundaries
 */
function getCurrentWeekBounds() {
    const weekStart = getWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    return {
        startTimestamp: weekStart.getTime(),
        endTimestamp: weekEnd.getTime(),
        weekNumber: getWeekNumber(weekStart),
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString()
    };
}

/**
 * Get week number of the year
 * @param {Date} date
 * @returns {number} Week number
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = {
    initializeWeeklyReset,
    performWeeklyReset,
    getCurrentWeekBounds,
    getTimeUntilNextReset,
    getNextMondayMidnight,
    isWeeklyResetTime,
    getWeekStart
};