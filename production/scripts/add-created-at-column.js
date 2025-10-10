#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data.sqlite');
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

try {
  // Check if created_at column exists
  const tableInfo = db.pragma('table_info(travel_history)');
  const hasCreatedAt = tableInfo.some(col => col.name === 'created_at');

  console.log('Current columns:', tableInfo.map(c => c.name).join(', '));

  if (!hasCreatedAt) {
    console.log('Adding created_at column...');
    db.exec('ALTER TABLE travel_history ADD COLUMN created_at INTEGER DEFAULT (strftime(\'%s\', \'now\'))');

    console.log('✅ created_at column added successfully');
  } else {
    console.log('✅ created_at column already exists');
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
