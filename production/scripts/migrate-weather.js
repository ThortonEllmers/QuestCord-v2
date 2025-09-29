#!/usr/bin/env node

/**
 * Weather System Migration Script
 *
 * This script ensures the weather system database tables are properly initialized.
 * Run this script if you're experiencing issues with weather events not displaying
 * on the website or if weather commands are failing.
 *
 * Usage: node scripts/migrate-weather.js
 */

const { db } = require('../src/utils/store_sqlite');
const { initializeWeatherSystem } = require('../src/utils/weather');

console.log('🌦️  Weather System Migration');
console.log('=============================');

try {
  // Initialize the weather system database tables
  const result = initializeWeatherSystem();

  if (result) {
    console.log('✅ Weather system database tables initialized successfully');

    // Check if tables were created properly
    const weatherEventsExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='weather_events'
    `).get();

    const weatherEncountersExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='weather_encounters'
    `).get();

    if (weatherEventsExists && weatherEncountersExists) {
      console.log('✅ Verified: weather_events and weather_encounters tables exist');

      // Check current weather count
      const activeWeatherCount = db.prepare(`
        SELECT COUNT(*) as count FROM weather_events WHERE endTime > ?
      `).get(Date.now());

      console.log(`📊 Current active weather events: ${activeWeatherCount.count}`);

      console.log('');
      console.log('🎉 Weather system migration completed successfully!');
      console.log('');
      console.log('You can now:');
      console.log('- Use /weather commands in Discord');
      console.log('- See active weather events on the website status page');
      console.log('- Create weather events that will persist properly');

    } else {
      console.error('❌ Migration failed: Tables were not created properly');
      process.exit(1);
    }

  } else {
    console.error('❌ Weather system initialization failed');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Migration error:', error.message);
  console.error('');
  console.error('This might be because:');
  console.error('- The database is locked by another process');
  console.error('- Database permissions are incorrect');
  console.error('- The weather.js file is missing or corrupted');
  process.exit(1);
}