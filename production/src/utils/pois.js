const { db } = require('./store_sqlite');

// Famous landmarks data - Top 10 world landmarks (expensive to visit!)
const LANDMARKS = [
  {
    id: 'eiffel_tower',
    name: 'Eiffel Tower',
    description: 'The iconic iron lattice tower in Paris, France. A symbol of romance and French culture.',
    lat: 48.8584,
    lon: 2.2945,
    country: 'France',
    category: 'monument',
    emoji: '🗼',
    discoveryReward: 0,
    visitCost: 25
  },
  {
    id: 'statue_of_liberty',
    name: 'Statue of Liberty',
    description: 'A gift from France to America, symbolizing freedom and democracy in New York Harbor.',
    lat: 40.6892,
    lon: -74.0445,
    country: 'United States',
    category: 'monument',
    emoji: '🗽',
    discoveryReward: 0,
    visitCost: 30
  },
  {
    id: 'great_wall_china',
    name: 'Great Wall of China',
    description: 'An ancient fortification stretching over 13,000 miles across northern China.',
    lat: 40.4319,
    lon: 116.5704,
    country: 'China',
    category: 'historical',
    emoji: '🏯',
    discoveryReward: 0,
    visitCost: 40
  },
  {
    id: 'colosseum',
    name: 'Colosseum',
    description: 'The largest amphitheater ever built, an iconic symbol of Imperial Rome.',
    lat: 41.8902,
    lon: 12.4922,
    country: 'Italy',
    category: 'historical',
    emoji: '🏛️',
    discoveryReward: 0,
    visitCost: 35
  },
  {
    id: 'taj_mahal',
    name: 'Taj Mahal',
    description: 'A white marble mausoleum built as a symbol of love in Agra, India.',
    lat: 27.1751,
    lon: 78.0421,
    country: 'India',
    category: 'monument',
    emoji: '🕌',
    discoveryReward: 0,
    visitCost: 35
  },
  {
    id: 'machu_picchu',
    name: 'Machu Picchu',
    description: 'Ancient Incan citadel set high in the Andes Mountains of Peru.',
    lat: -13.1631,
    lon: -72.5450,
    country: 'Peru',
    category: 'historical',
    emoji: '⛰️',
    discoveryReward: 0,
    visitCost: 45
  },
  {
    id: 'christ_redeemer',
    name: 'Christ the Redeemer',
    description: 'Art Deco statue of Jesus Christ overlooking Rio de Janeiro, Brazil.',
    lat: -22.9519,
    lon: -43.2105,
    country: 'Brazil',
    category: 'monument',
    emoji: '⛪',
    discoveryReward: 0,
    visitCost: 30
  },
  {
    id: 'mount_fuji',
    name: 'Mount Fuji',
    description: 'Japan\'s sacred mountain and highest peak, known for its perfectly shaped cone.',
    lat: 35.3606,
    lon: 138.7274,
    country: 'Japan',
    category: 'natural',
    emoji: '🗻',
    discoveryReward: 0,
    visitCost: 40
  },
  {
    id: 'pyramids_giza',
    name: 'Pyramids of Giza',
    description: 'Ancient Egyptian pyramids including the Great Pyramid, one of the Seven Wonders.',
    lat: 29.9792,
    lon: 31.1342,
    country: 'Egypt',
    category: 'historical',
    emoji: '🏜️',
    discoveryReward: 0,
    visitCost: 60
  },
  {
    id: 'stonehenge',
    name: 'Stonehenge',
    description: 'Prehistoric stone circle monument in Wiltshire, England, shrouded in mystery.',
    lat: 51.1789,
    lon: -1.8262,
    country: 'United Kingdom',
    category: 'historical',
    emoji: '🗿',
    discoveryReward: 0,
    visitCost: 40
  }
];

/**
 * Initialize POIs in the database
 */
function initializePOIs() {
  const insertPOI = db.prepare(`
    INSERT OR REPLACE INTO pois (id, name, description, lat, lon, country, category, emoji, discoveryReward, visitCost, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  let inserted = 0;

  for (const poi of LANDMARKS) {
    try {
      insertPOI.run(
        poi.id,
        poi.name,
        poi.description,
        poi.lat,
        poi.lon,
        poi.country,
        poi.category,
        poi.emoji,
        poi.discoveryReward,
        poi.visitCost,
        now
      );
      inserted++;
    } catch (error) {
      console.warn(`Failed to insert POI ${poi.id}:`, error.message);
    }
  }

  console.log(`[POI] Initialized ${inserted}/${LANDMARKS.length} points of interest`);
  return inserted;
}

/**
 * Get all POIs
 */
function getAllPOIs() {
  return db.prepare('SELECT * FROM pois ORDER BY name').all();
}

/**
 * Get POI by ID
 */
function getPOIById(id) {
  return db.prepare('SELECT * FROM pois WHERE id = ?').get(id);
}

/**
 * Get POIs by category
 */
function getPOIsByCategory(category) {
  return db.prepare('SELECT * FROM pois WHERE category = ? ORDER BY name').all(category);
}

/**
 * Get nearby POIs within a certain radius (in kilometers)
 */
function getNearbyPOIs(lat, lon, radiusKm = 500) {
  const pois = getAllPOIs();
  return pois.filter(poi => {
    const distance = calculateDistance(lat, lon, poi.lat, poi.lon);
    return distance <= radiusKm;
  }).sort((a, b) => {
    const distA = calculateDistance(lat, lon, a.lat, a.lon);
    const distB = calculateDistance(lat, lon, b.lat, b.lon);
    return distA - distB;
  });
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Check if user has visited a POI
 */
function hasVisitedPOI(userId, poiId) {
  const visit = db.prepare('SELECT 1 FROM poi_visits WHERE userId = ? AND poiId = ?').get(userId, poiId);
  return !!visit;
}

/**
 * Get user's visited POIs
 */
function getUserVisitedPOIs(userId) {
  return db.prepare(`
    SELECT p.*, pv.visitedAt, pv.isFirstVisit
    FROM pois p 
    JOIN poi_visits pv ON p.id = pv.poiId 
    WHERE pv.userId = ? 
    ORDER BY pv.visitedAt DESC
  `).all(userId);
}

/**
 * Get user's POI visit count
 */
function getUserPOIVisitCount(userId) {
  const result = db.prepare('SELECT COUNT(*) as count FROM poi_visits WHERE userId = ?').get(userId);
  return result.count;
}

/**
 * Visit a POI (record the visit and give rewards)
 */
function visitPOI(userId, poiId) {
  const poi = getPOIById(poiId);
  if (!poi) {
    throw new Error('POI not found');
  }

  const hasVisited = hasVisitedPOI(userId, poiId);
  const isFirstVisit = !hasVisited;
  
  if (hasVisited) {
    throw new Error('You have already visited this landmark');
  }

  const now = Date.now();
  
  // Record the visit
  db.prepare(`
    INSERT INTO poi_visits (userId, poiId, visitedAt, isFirstVisit)
    VALUES (?, ?, ?, ?)
  `).run(userId, poiId, now, isFirstVisit ? 1 : 0);

  // Give rewards for first visit
  let reward = 0;
  if (isFirstVisit) {
    reward = poi.discoveryReward;
    
    // Add currency reward
    const updatePlayer = db.prepare('UPDATE players SET drakari = drakari + ? WHERE userId = ?');
    const result = updatePlayer.run(reward, userId);
    
    if (result.changes === 0) {
      // Player doesn't exist, create them
      const { ensurePlayerWithVehicles } = require('./players');
      // Note: We'll need the client and username for this, but for now just create basic player
      db.prepare(`
        INSERT INTO players (userId, name, locationGuildId, vehicle, health, stamina, drakari, travelArrivalAt)
        VALUES (?, 'Unknown', NULL, 'plane', 100, 100, ?, 0)
      `).run(userId, reward);
    }
  }

  return {
    poi,
    isFirstVisit,
    reward,
    visitedAt: now
  };
}

module.exports = {
  initializePOIs,
  getAllPOIs,
  getPOIById,
  getPOIsByCategory,
  getNearbyPOIs,
  calculateDistance,
  hasVisitedPOI,
  getUserVisitedPOIs,
  getUserPOIVisitCount,
  visitPOI,
  LANDMARKS
};