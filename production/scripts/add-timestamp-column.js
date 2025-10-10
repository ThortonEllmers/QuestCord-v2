#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data.sqlite');
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

try {
  // Check if timestamp column exists
  const tableInfo = db.pragma('table_info(travel_history)');
  const hasTimestamp = tableInfo.some(col => col.name === 'timestamp');

  console.log('Current columns:', tableInfo.map(c => c.name).join(', '));

  if (!hasTimestamp) {
    console.log('Adding timestamp column...');
    db.exec('ALTER TABLE travel_history ADD COLUMN timestamp INTEGER');

    // Set default timestamp based on startedAt or current time
    db.exec(`
      UPDATE travel_history
      SET timestamp = COALESCE(startedAt, strftime('%s', 'now') * 1000)
      WHERE timestamp IS NULL
    `);

    console.log('✅ timestamp column added successfully');
  } else {
    console.log('✅ timestamp column already exists');
  }

  // Verify the fix
  const updatedTableInfo = db.pragma('table_info(travel_history)');
  console.log('Updated columns:', updatedTableInfo.map(c => c.name).join(', '));

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  db.close();
}
