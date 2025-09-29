const config = require('./config');

function itemById(id){
  return (config.items || []).find(i => i.id === id) || null;
}
function itemByNameOrId(q){
  return (config.items || []).find(i => i.id === q) || (config.items || []).find(i => i.name.toLowerCase() === String(q||'').toLowerCase()) || null;
}
function isTradable(id){
  const it = itemById(id);
  if (!it) return false;
  if (it.tradable === false) return false;
  const bl = (config.tradeBlacklist || []);
  return !bl.includes(id);
}
function rarityMult(r){
  const map = config.rarityMultipliers || {};
  return map[r] || 1.0;
}
function weightsForTier(tier) {
  const w = (config.lootRarityWeights || {})[String(tier)] || (config.lootRarityWeights || {})['1'] || {};
  return w;
}
function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return 'common';
  let roll = Math.random() * total;
  for (const [k, v] of entries) {
    if ((roll -= v) <= 0) return k;
  }
  return entries[0][0];
}
function pickLootByTier(tier, isPremium) {
  const targetRarity = weightedPick(weightsForTier(tier));
  const pool = (config.items || []).filter(i => i.rarity === targetRarity && !i.consumable && i.equipSlot !== 'vehicle');
  // allow materials/weapons etc; exclude vehicles to avoid movement gating
  let list = pool;
  if (!isPremium) list = list.filter(i => !i.premiumNeeded);
  if (list.length === 0){
    // fallback to global loot table
    const lt = (config.lootTable || []);
    const any = lt[Math.floor(Math.random()*lt.length)];
    return any ? any.id : null;
  }
  return list[Math.floor(Math.random()*list.length)].id;
}
module.exports = { itemById, itemByNameOrId, isTradable, rarityMult, pickLootByTier };
