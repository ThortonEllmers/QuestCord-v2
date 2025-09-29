const { db } = require('../utils/store_sqlite');

function isBanned(userId){
  const row = db.prepare('SELECT * FROM bans WHERE userId=?').get(userId);
  if (!row) return false;
  if (row.expiresAt && row.expiresAt < Date.now()){
    db.prepare('DELETE FROM bans WHERE userId=?').run(userId);
    return false;
  }
  return true;
}

function regenStamina(userId){
  const p = db.prepare('SELECT stamina, staminaUpdatedAt FROM players WHERE userId=?').get(userId);
  if (!p) return;
  const now = Date.now();
  const last = p.staminaUpdatedAt || 0;
  const minutes = Math.floor((now - last)/60000);
  if (minutes > 0){
    const next = Math.min(100, p.stamina + minutes); // +1 per minute
    db.prepare('UPDATE players SET stamina=?, staminaUpdatedAt=? WHERE userId=?').run(next, now, userId);
  }
}

module.exports = { isBanned, regenStamina };
