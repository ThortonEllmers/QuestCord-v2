const { db } = require('./store_sqlite');

// Discord notification configuration
const DISCORD_CONFIG = {
  WEATHER_CHANNEL_ID: '1411045103921004554',
  WEATHER_ROLE_ID: '1411069664339034152'
};

// Geographic weather preferences based on real-world climate patterns
const WEATHER_GEOGRAPHY = {
  'cyclone': {
    preferredRegions: ['tropical', 'coastal'],
    latRange: [-30, 30], // Tropical cyclone belt
    avoidPolar: true
  },
  'hurricane': {
    preferredRegions: ['tropical', 'coastal'],
    latRange: [5, 40], // Hurricane formation zones
    avoidPolar: true,
    seasonalBonus: [6, 7, 8, 9, 10, 11] // Hurricane season (Jun-Nov)
  },
  'blizzard': {
    preferredRegions: ['polar', 'temperate'],
    latRange: [30, 90], // Northern regions
    seasonalBonus: [12, 1, 2, 3] // Winter months
  },
  'heavy_snow': {
    preferredRegions: ['polar', 'temperate'],
    latRange: [25, 90],
    seasonalBonus: [11, 12, 1, 2, 3, 4]
  },
  'sandstorm': {
    preferredRegions: ['desert', 'arid'],
    latRange: [10, 45], // Desert belt
    lonPreference: 'continental' // Away from oceans
  },
  'thunderstorm': {
    preferredRegions: ['temperate', 'tropical'],
    latRange: [-50, 50],
    seasonalBonus: [4, 5, 6, 7, 8, 9] // Spring/Summer
  },
  'fog_bank': {
    preferredRegions: ['coastal', 'temperate'],
    latRange: [30, 60], // Mid-latitudes
    coastalPreference: true
  },
  'aurora_storm': {
    preferredRegions: ['polar'],
    latRange: [60, 90], // Arctic/Antarctic
    rareBonus: true
  },
  'volcanic_ash': {
    preferredRegions: ['volcanic'],
    // Volcanic activity zones (Ring of Fire, etc.)
    ringOfFire: true,
    ultraRare: true
  }
};

/**
 * Generate realistic weather location with global distribution and minimum spacing
 */
function generateRealisticWeatherLocation(weatherType, weatherData, servers, activeWeatherEvents) {
  const geoPrefs = WEATHER_GEOGRAPHY[weatherType];
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  
  // Define global regions for better distribution
  const globalRegions = [
    { name: 'North America', latRange: [25, 70], lonRange: [-170, -50] },
    { name: 'South America', latRange: [-60, 15], lonRange: [-85, -30] },
    { name: 'Europe', latRange: [35, 75], lonRange: [-15, 45] },
    { name: 'Africa', latRange: [-35, 40], lonRange: [-20, 55] },
    { name: 'Asia', latRange: [5, 75], lonRange: [25, 180] },
    { name: 'Oceania', latRange: [-50, 20], lonRange: [110, 180] },
    { name: 'Arctic', latRange: [60, 90], lonRange: [-180, 180] },
    { name: 'Antarctic', latRange: [-90, -60], lonRange: [-180, 180] },
    { name: 'Pacific Ocean', latRange: [-60, 60], lonRange: [120, -120] },
    { name: 'Atlantic Ocean', latRange: [-60, 70], lonRange: [-70, 20] },
    { name: 'Indian Ocean', latRange: [-60, 30], lonRange: [20, 120] }
  ];
  
  // Minimum distance between weather events (in km)
  const minDistance = weatherData.severity >= 4 ? 1500 : weatherData.severity >= 3 ? 1000 : 800;
  
  let attempts = 0;
  const maxAttempts = 50;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    let potentialLocation;
    
    // Use geographic preferences if available
    if (geoPrefs) {
      // Filter regions based on weather preferences
      const suitableRegions = globalRegions.filter(region => {
        // Check latitude range
        if (geoPrefs.latRange) {
          const [prefMinLat, prefMaxLat] = geoPrefs.latRange;
          return !(region.latRange[1] < prefMinLat || region.latRange[0] > prefMaxLat);
        }
        
        // Polar preferences
        if (geoPrefs.avoidPolar && (region.latRange[1] > 60 || region.latRange[0] < -60)) {
          return false;
        }
        
        return true;
      });
      
      if (suitableRegions.length === 0) {
        // Fallback to any region
        potentialLocation = generateRandomGlobalLocation();
      } else {
        // Choose a suitable region
        const chosenRegion = suitableRegions[Math.floor(Math.random() * suitableRegions.length)];
        potentialLocation = generateLocationInRegion(chosenRegion);
      }
    } else {
      // No preferences, use global distribution
      potentialLocation = generateRandomGlobalLocation();
    }
    
    // Check minimum distance from existing weather events
    let tooClose = false;
    for (const existingWeather of activeWeatherEvents) {
      const distance = calculateDistance(
        potentialLocation.centerLat, potentialLocation.centerLon,
        existingWeather.centerLat, existingWeather.centerLon
      );
      
      if (distance < minDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      // Apply seasonal bonus
      let rarityMultiplier = 1;
      if (geoPrefs && geoPrefs.seasonalBonus && geoPrefs.seasonalBonus.includes(month)) {
        rarityMultiplier = 2;
      }
      
      return {
        centerLat: potentialLocation.centerLat,
        centerLon: potentialLocation.centerLon,
        rarityMultiplier
      };
    }
  }
  
  // If we couldn't find a good spot after max attempts, use random location
  console.warn(`[weather] Could not find well-spaced location for ${weatherType} after ${maxAttempts} attempts`);
  const fallback = generateRandomGlobalLocation();
  return {
    centerLat: fallback.centerLat,
    centerLon: fallback.centerLon,
    rarityMultiplier: 1
  };
}

/**
 * Generate a random location within a specific region
 */
function generateLocationInRegion(region) {
  const lat = region.latRange[0] + Math.random() * (region.latRange[1] - region.latRange[0]);
  let lon;
  
  // Handle longitude wraparound for Pacific regions
  if (region.lonRange[0] > region.lonRange[1]) {
    // Crosses the 180° meridian
    const range1 = 180 - region.lonRange[0];
    const range2 = region.lonRange[1] - (-180);
    const totalRange = range1 + range2;
    
    if (Math.random() < range1 / totalRange) {
      lon = region.lonRange[0] + Math.random() * range1;
    } else {
      lon = -180 + Math.random() * range2;
    }
  } else {
    lon = region.lonRange[0] + Math.random() * (region.lonRange[1] - region.lonRange[0]);
  }
  
  return { centerLat: lat, centerLon: lon };
}

/**
 * Generate a completely random global location
 */
function generateRandomGlobalLocation() {
  // Favor populated areas but allow oceanic weather
  const isOceanic = Math.random() < 0.3; // 30% chance for oceanic weather
  
  if (isOceanic) {
    // Generate oceanic location
    return {
      centerLat: -60 + Math.random() * 120, // -60 to +60
      centerLon: -180 + Math.random() * 360  // Full longitude range
    };
  } else {
    // Generate continental location (weighted towards populated areas)
    const populatedAreas = [
      { lat: 40, lon: -100, weight: 0.2 }, // North America
      { lat: -15, lon: -60, weight: 0.15 }, // South America
      { lat: 50, lon: 10, weight: 0.15 },   // Europe
      { lat: 0, lon: 20, weight: 0.1 },     // Africa
      { lat: 35, lon: 100, weight: 0.25 },  // Asia
      { lat: -25, lon: 140, weight: 0.1 },  // Australia
      { lat: 70, lon: 0, weight: 0.05 }     // Arctic
    ];
    
    const chosen = populatedAreas[Math.floor(Math.random() * populatedAreas.length)];
    
    // Add significant randomness (±20 degrees) for global spread
    return {
      centerLat: Math.max(-85, Math.min(85, chosen.lat + (Math.random() - 0.5) * 40)),
      centerLon: chosen.lon + (Math.random() - 0.5) * 40
    };
  }
}

/**
 * Weather System for QuestCord
 * Generates dynamic weather events that affect travel and gameplay
 */

// Ultimate Weather System - 20 Dynamic Global Weather Events
const WEATHER_TYPES = {
  // CATASTROPHIC WEATHER (Severity 5) - Complete Travel Blockade
  'superstorm': {
    name: 'Superstorm Genesis',
    severity: 5,
    icon: '🌪️',
    color: '#8B0000',
    radius: 250,
    blockTravel: true,
    travelTimeMultiplier: 0,
    description: 'Massive rotating storm system of unprecedented scale',
    rarity: 0.001,
    specialEffects: ['electromagnetic_interference', 'flight_grounding'],
    duration: { min: 180, max: 360 }
  },
  'category_6_hurricane': {
    name: 'Hypercane',
    severity: 5,
    icon: '🌀',
    color: '#DC143C',
    radius: 300,
    blockTravel: true,
    travelTimeMultiplier: 0,
    description: 'Theoretical Category 6 hurricane with winds exceeding 200mph',
    rarity: 0.0005,
    specialEffects: ['total_devastation'],
    duration: { min: 240, max: 480 }
  },
  'ice_apocalypse': {
    name: 'Ice Apocalypse',
    severity: 5,
    icon: '🧊',
    color: '#191970',
    radius: 200,
    blockTravel: true,
    travelTimeMultiplier: 0,
    description: 'Catastrophic ice storm causing complete infrastructure collapse',
    rarity: 0.0008,
    specialEffects: ['power_grid_failure'],
    duration: { min: 300, max: 600 }
  },

  // SEVERE WEATHER (Severity 4) - Major Travel Disruption
  'cyclonic_bomb': {
    name: 'Cyclonic Bomb',
    severity: 4,
    icon: '💥',
    color: '#4B0082',
    radius: 150,
    blockTravel: true,
    travelTimeMultiplier: 0,
    description: 'Rapidly intensifying storm with explosive development',
    rarity: 0.003,
    specialEffects: ['rapid_pressure_drop'],
    duration: { min: 120, max: 240 }
  },
  'pyroclastic_surge': {
    name: 'Pyroclastic Flow',
    severity: 4,
    icon: '🌋',
    color: '#FF4500',
    radius: 180,
    blockTravel: true,
    travelTimeMultiplier: 0,
    description: 'Deadly volcanic gas and debris flow',
    rarity: 0.0002,
    specialEffects: ['air_toxicity', 'ash_fallout'],
    duration: { min: 60, max: 180 }
  },
  'derecho_windstorm': {
    name: 'Derecho',
    severity: 4,
    icon: '💨',
    color: '#228B22',
    radius: 120,
    blockTravel: true,
    travelTimeMultiplier: 0,
    description: 'Land hurricane with straight-line winds over 100mph',
    rarity: 0.004,
    specialEffects: ['widespread_destruction'],
    duration: { min: 90, max: 180 }
  },

  // DANGEROUS WEATHER (Severity 3) - Significant Travel Impact
  'supercell_outbreak': {
    name: 'Supercell Tornado Complex',
    severity: 3,
    icon: '🌪️',
    color: '#800080',
    radius: 100,
    blockTravel: false,
    travelTimeMultiplier: 2.5,
    description: 'Multiple rotating supercells spawning tornadoes',
    rarity: 0.008,
    specialEffects: ['tornado_spawning', 'hail_damage'],
    duration: { min: 120, max: 300 }
  },
  'atmospheric_river': {
    name: 'Atmospheric River',
    severity: 3,
    icon: '🌊',
    color: '#1E90FF',
    radius: 200,
    blockTravel: false,
    travelTimeMultiplier: 1.8,
    description: 'Narrow corridor of concentrated water vapor causing flooding',
    rarity: 0.006,
    specialEffects: ['flash_flooding', 'landslides'],
    duration: { min: 360, max: 720 }
  },
  'haboob_dust_wall': {
    name: 'Haboob',
    severity: 3,
    icon: '🏜️',
    color: '#D2B48C',
    radius: 150,
    blockTravel: false,
    travelTimeMultiplier: 2.0,
    description: 'Massive wall of dust reducing visibility to zero',
    rarity: 0.005,
    specialEffects: ['zero_visibility', 'respiratory_hazard'],
    duration: { min: 45, max: 120 }
  },
  'polar_vortex': {
    name: 'Polar Vortex',
    severity: 3,
    icon: '🥶',
    color: '#00BFFF',
    radius: 300,
    blockTravel: false,
    travelTimeMultiplier: 1.7,
    description: 'Arctic air mass bringing life-threatening cold',
    rarity: 0.007,
    specialEffects: ['hypothermia_risk', 'infrastructure_freeze'],
    duration: { min: 480, max: 1440 }
  },
  'wildfire_complex': {
    name: 'Burnt Chicken Nugget Maker',
    severity: 3,
    icon: '🔥',
    color: '#FF4500',
    radius: 200,
    blockTravel: false,
    travelTimeMultiplier: 1.8,
    description: 'An Actual Way To Beat Emus',
    rarity: 0.008,
    specialEffects: ['smoke_hazard', 'air_quality_danger', 'heat_exposure'],
    duration: { min: 360, max: 2160 }
  },

  // MODERATE WEATHER (Severity 2) - Moderate Travel Delays
  'gravity_wave_storm': {
    name: 'Gravity Wave Storm',
    severity: 2,
    icon: '〰️',
    color: '#9370DB',
    radius: 80,
    blockTravel: false,
    travelTimeMultiplier: 1.4,
    description: 'Atmospheric waves causing severe turbulence',
    rarity: 0.012,
    specialEffects: ['extreme_turbulence'],
    duration: { min: 60, max: 180 }
  },
  'temperature_inversion': {
    name: 'Thermal Inversion',
    severity: 2,
    icon: '🌡️',
    color: '#FF6347',
    radius: 120,
    blockTravel: false,
    travelTimeMultiplier: 1.3,
    description: 'Atmospheric layer trapping pollutants and creating hazardous conditions',
    rarity: 0.015,
    specialEffects: ['air_quality_hazard'],
    duration: { min: 240, max: 720 }
  },
  'microbursts_cluster': {
    name: 'Microburst Cluster',
    severity: 2,
    icon: '⬇️',
    color: '#FF69B4',
    radius: 60,
    blockTravel: false,
    travelTimeMultiplier: 1.5,
    description: 'Localized downdrafts creating dangerous wind shear',
    rarity: 0.018,
    specialEffects: ['wind_shear', 'aviation_hazard'],
    duration: { min: 30, max: 90 }
  },
  'ice_pellet_storm': {
    name: 'Ice Pellet Storm',
    severity: 2,
    icon: '🧊',
    color: '#B0E0E6',
    radius: 70,
    blockTravel: false,
    travelTimeMultiplier: 1.4,
    description: 'Freezing rain creating hazardous icy conditions',
    rarity: 0.020,
    specialEffects: ['icing_conditions'],
    duration: { min: 120, max: 360 }
  },

  // MILD WEATHER (Severity 1) - Minor Travel Effects
  'sea_fog_bank': {
    name: 'Marine Layer Fog',
    severity: 1,
    icon: '🌫️',
    color: '#C0C0C0',
    radius: 90,
    blockTravel: false,
    travelTimeMultiplier: 1.2,
    description: 'Dense fog rolling in from the ocean',
    rarity: 0.035,
    specialEffects: ['reduced_visibility'],
    duration: { min: 180, max: 480 }
  },
  'mountain_wave_turbulence': {
    name: 'Mountain Wave',
    severity: 1,
    icon: '🏔️',
    color: '#8FBC8F',
    radius: 50,
    blockTravel: false,
    travelTimeMultiplier: 1.1,
    description: 'Turbulent air caused by mountain terrain',
    rarity: 0.040,
    specialEffects: ['moderate_turbulence'],
    duration: { min: 120, max: 300 }
  },

  // RARE PHENOMENA - Special Effects
  'aurora_substorm': {
    name: 'Aurora Substorm',
    severity: 1,
    icon: '✨',
    color: '#00FF7F',
    radius: 150,
    blockTravel: false,
    travelTimeMultiplier: 0.85, // Actually helps navigation!
    description: 'Spectacular aurora with enhanced magnetic activity',
    rarity: 0.0008,
    specialEffects: ['navigation_boost', 'communication_interference'],
    duration: { min: 180, max: 600 }
  },
  'ball_lightning_field': {
    name: 'Ball Lightning Phenomenon',
    severity: 2,
    icon: '⚡',
    color: '#FFFF00',
    radius: 40,
    blockTravel: false,
    travelTimeMultiplier: 1.2,
    description: 'Rare electromagnetic phenomenon with floating plasma spheres',
    rarity: 0.0001,
    specialEffects: ['electrical_anomaly', 'equipment_malfunction'],
    duration: { min: 15, max: 60 }
  },
  'sprite_lightning_storm': {
    name: 'Sprite Lightning Event',
    severity: 1,
    icon: '👻',
    color: '#FF1493',
    radius: 100,
    blockTravel: false,
    travelTimeMultiplier: 1.0,
    description: 'High-altitude electrical discharge creating otherworldly light show',
    rarity: 0.0003,
    specialEffects: ['upper_atmosphere_phenomenon'],
    duration: { min: 30, max: 120 }
  }
};

/**
 * Initialize weather system database tables
 */
function initializeWeatherSystem() {
  try {
    // Create weather_events table with enhanced schema
    db.prepare(`
      CREATE TABLE IF NOT EXISTS weather_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        centerLat REAL NOT NULL,
        centerLon REAL NOT NULL,
        radius REAL NOT NULL,
        severity INTEGER NOT NULL,
        startTime INTEGER NOT NULL,
        endTime INTEGER NOT NULL,
        active INTEGER DEFAULT 1,
        specialEffects TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `).run();
    
    // Add specialEffects column if it doesn't exist (migration)
    try {
      db.prepare('ALTER TABLE weather_events ADD COLUMN specialEffects TEXT').run();
    } catch (error) {
      // Column already exists, that's fine
    }
    
    // Create weather_encounters table for tracking player interactions
    db.prepare(`
      CREATE TABLE IF NOT EXISTS weather_encounters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        weatherEventId INTEGER NOT NULL,
        encounterType TEXT NOT NULL, -- 'avoided', 'flew_through', 'detoured'
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (weatherEventId) REFERENCES weather_events(id)
      )
    `).run();
    
    console.log('[weather] Weather system database initialized');
    return true;
  } catch (error) {
    console.error('[weather] Failed to initialize weather system:', error.message);
    return false;
  }
}

/**
 * Send Discord notification for significant weather events
 */
async function notifyDiscordWeatherEvent(weatherEvent, weatherType, client) {
  try {
    if (!client || weatherType.severity < 4) {
      return; // Only notify for severe weather (severity 4+) and above
    }

    const channel = await client.channels.fetch(DISCORD_CONFIG.WEATHER_CHANNEL_ID);
    if (!channel) {
      console.warn('[weather] Could not find weather notification channel');
      return;
    }

    // Calculate duration
    const durationMs = weatherEvent.endTime - weatherEvent.startTime;
    const durationHours = Math.round(durationMs / 1000 / 60 / 60 * 10) / 10; // Round to 1 decimal

    // Find nearest servers for context
    const nearbyServers = db.prepare(`
      SELECT name, guildId,
        ((lat - ?) * (lat - ?) + (lon - ?) * (lon - ?)) as distanceSquared
      FROM servers 
      WHERE lat IS NOT NULL AND lon IS NOT NULL AND archived = 0
      ORDER BY distanceSquared
      LIMIT 3
    `).all(weatherEvent.centerLat, weatherEvent.centerLat, weatherEvent.centerLon, weatherEvent.centerLon);

    const nearbyText = nearbyServers.length > 0 
      ? `\n**Near:** ${nearbyServers.map(s => s.name).join(', ')}`
      : '';

    const { EmbedBuilder } = require('discord.js');
    const isSevereWeather = weatherType.blockTravel && weatherType.severity >= 4;
    const embed = new EmbedBuilder()
      .setTitle(`${weatherType.icon} **${weatherType.name.toUpperCase()} ${isSevereWeather ? 'ALERT' : 'ADVISORY'}** ${weatherType.icon}`)
      .setDescription(`${isSevereWeather ? '**SEVERE WEATHER WARNING**' : '**WEATHER ADVISORY**'}\n*${weatherType.description}*`)
      .setColor(parseInt(weatherType.color.replace('#', ''), 16) || 0xFF0000)
      .addFields(
        {
          name: '**TRAVEL WARNING**',
          value: weatherType.blockTravel 
            ? '**ALL TRAVEL THROUGH THIS AREA IS BLOCKED**\nTravelers will be automatically routed around this storm'
            : `**TRAVEL DELAYED** - Speed reduced by ${Math.round((weatherType.travelTimeMultiplier - 1) * 100)}%\nTravel through this area will take longer`,
          inline: false
        },
        {
          name: '**Storm Details**',
          value: `**Severity:** ${weatherType.severity}/5\n**Radius:** ${weatherEvent.radius}km\n**Duration:** ~${durationHours}h${nearbyText}`,
          inline: true
        },
        {
          name: '**Location**',
          value: `**Coordinates:** ${weatherEvent.centerLat.toFixed(2)}, ${weatherEvent.centerLon.toFixed(2)}\n**Website:** [Visit QuestCord](https://questcord.fun/)`,
          inline: true
        }
      )
      .setFooter({ 
        text: `${isSevereWeather ? 'Stay safe, adventurers!' : 'Plan your travels accordingly!'} Weather will clear automatically • QuestCord Weather System`,
        iconURL: client.user?.displayAvatarURL()
      })
      .setTimestamp();

    // Send notification with role mention
    await channel.send({
      content: `<@&${DISCORD_CONFIG.WEATHER_ROLE_ID}> ${isSevereWeather ? '**SEVERE WEATHER ALERT**' : '**WEATHER ADVISORY**'}`,
      embeds: [embed]
    });

    console.log(`[weather] Sent Discord notification for ${weatherType.name} event`);

  } catch (error) {
    console.error('[weather] Failed to send Discord notification:', error.message);
  }
}

/**
 * Generate random weather events based on probability
 */
function generateWeatherEvents(client = null) {
  try {
    const now = Date.now();

    // Clean up expired weather events with proper foreign key handling
    try {
      // First delete weather encounters for expired events to avoid FK constraint
      const expiredEventIds = db.prepare('SELECT id FROM weather_events WHERE endTime < ?').all(now);
      for (const event of expiredEventIds) {
        try {
          db.prepare('DELETE FROM weather_encounters WHERE weatherEventId = ?').run(event.id);
        } catch (fkError) {
          console.warn(`[weather] Failed to delete encounters for event ${event.id}:`, fkError.message);
        }
      }
      // Then delete the expired weather events
      db.prepare('DELETE FROM weather_events WHERE endTime < ?').run(now);
    } catch (cleanupError) {
      console.error('[weather] Error during weather cleanup:', cleanupError.message);
    }
    
    // Get current active weather count
    const activeCount = db.prepare('SELECT COUNT(*) as count FROM weather_events WHERE active = 1').get().count;
    
    // Maintain optimal weather density (15-20 active events globally)
    const targetEventCount = 18;
    const maxEventCount = 25;
    
    if (activeCount >= maxEventCount) {
      return;
    }
    
    // Increase spawn rate if below target
    const spawnRateMultiplier = activeCount < targetEventCount ? 2.0 : 1.0;
    
    // Get active weather events for spacing calculations
    const activeWeatherEvents = getActiveWeather();
    
    // Get servers for geographic context (but don't limit weather to server areas)
    const servers = db.prepare('SELECT lat, lon FROM servers WHERE lat IS NOT NULL AND lon IS NOT NULL AND archived = 0').all();
    
    // Generate weather events based on probability and geography
    for (const [typeId, weather] of Object.entries(WEATHER_TYPES)) {
      const adjustedRarity = weather.rarity * spawnRateMultiplier;
      if (Math.random() < adjustedRarity) {
        // Use geographic preferences for realistic weather placement
        const location = generateRealisticWeatherLocation(typeId, weather, servers, activeWeatherEvents);
        
        // Apply seasonal and geographic rarity bonus
        const effectiveRarity = weather.rarity * location.rarityMultiplier;
        if (Math.random() > effectiveRarity && location.rarityMultiplier > 1) {
          continue; // Skip this iteration if the bonus wasn't enough
        }
        
        // Dynamic duration based on weather type and severity
        const weatherDuration = weather.duration || { min: 60, max: 300 };
        const minDuration = weatherDuration.min * 60 * 1000; // Convert to milliseconds
        const maxDuration = weatherDuration.max * 60 * 1000;
        const duration = minDuration + Math.random() * (maxDuration - minDuration);
        
        const endTime = now + duration + (Math.random() * duration); // Add some randomness
        
        // Create weather event with dynamic radius scaling
        const radiusScale = weather.severity >= 4 ? 6 : weather.severity >= 3 ? 5 : 4;
        const finalRadius = weather.radius * radiusScale;
        
        const result = db.prepare(`
          INSERT INTO weather_events (type, centerLat, centerLon, radius, severity, startTime, endTime, specialEffects)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(typeId, location.centerLat, location.centerLon, finalRadius, weather.severity, now, endTime, JSON.stringify(weather.specialEffects || []));
        
        const weatherEvent = {
          id: result.lastInsertRowid,
          type: typeId,
          centerLat: location.centerLat,
          centerLon: location.centerLon,
          radius: finalRadius,
          severity: weather.severity,
          startTime: now,
          endTime
        };

        // Send Discord notification for severe weather (severity 4+)
        if (client) {
          notifyDiscordWeatherEvent(weatherEvent, weather, client);
        }
        
        console.log(`[weather] Generated ${weather.name} at (${location.centerLat.toFixed(2)}, ${location.centerLon.toFixed(2)}), radius: ${finalRadius}km, duration: ${Math.round(duration / 1000 / 60)}min, severity: ${weather.severity}`);
      }
    }
    
  } catch (error) {
    console.error('[weather] Error generating weather events:', error.message);
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      console.warn('[weather] Foreign key constraint failed during weather generation - this may indicate database corruption or race conditions');
    } else if (error.code === 'SQLITE_CORRUPT' || error.message.includes('malformed')) {
      console.error('[weather] Database corruption detected during weather generation - skipping weather generation cycle');
      return; // Skip this generation cycle to avoid further corruption
    } else if (error.code === 'SQLITE_BUSY') {
      console.warn('[weather] Database is busy during weather generation - will retry next cycle');
      return; // Skip this cycle, will retry later
    }
  }
}

/**
 * Get all active weather events
 */
function getActiveWeather() {
  try {
    const now = Date.now();
    return db.prepare(`
      SELECT * FROM weather_events
      WHERE endTime > ?
      ORDER BY startTime DESC
    `).all(now);
  } catch (error) {
    console.error('[weather] Error getting active weather:', error.message);
    if (error.code === 'SQLITE_CORRUPT' || error.message.includes('malformed')) {
      console.error('[weather] Database corruption detected in getActiveWeather - returning empty weather list');
    } else if (error.code === 'SQLITE_BUSY') {
      console.warn('[weather] Database busy in getActiveWeather - returning empty weather list temporarily');
    }
    return []; // Return empty array to prevent cascading failures
  }
}

/**
 * Check if a coordinate is affected by severe weather
 */
function isLocationAffectedBySevereWeather(lat, lon) {
  const activeWeather = getActiveWeather();
  
  for (const weather of activeWeather) {
    const weatherType = WEATHER_TYPES[weather.type];
    if (!weatherType || !weatherType.blockTravel) continue;
    
    const distance = calculateDistance(lat, lon, weather.centerLat, weather.centerLon);
    if (distance <= weather.radius) {
      return {
        blocked: true,
        weather: weather,
        weatherType: weatherType,
        distance: distance
      };
    }
  }
  
  return { blocked: false };
}

/**
 * Calculate distance between two points in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Find safe path around severe weather using A* pathfinding
 */
function findSafePathAroundWeather(fromLat, fromLon, toLat, toLon) {
  const activeWeather = getActiveWeather().filter(w => WEATHER_TYPES[w.type]?.blockTravel);
  
  // If no severe weather, return direct path
  if (activeWeather.length === 0) {
    return {
      path: [{lat: fromLat, lon: fromLon}, {lat: toLat, lon: toLon}],
      weatherEncountered: [],
      totalDistance: calculateDistance(fromLat, fromLon, toLat, toLon),
      detourRequired: false
    };
  }
  
  // Check if direct path intersects severe weather
  const directPathBlocked = checkPathIntersectsWeather(fromLat, fromLon, toLat, toLon, activeWeather);
  
  if (!directPathBlocked.blocked) {
    return {
      path: [{lat: fromLat, lon: fromLon}, {lat: toLat, lon: toLon}],
      weatherEncountered: [],
      totalDistance: calculateDistance(fromLat, fromLon, toLat, toLon),
      detourRequired: false
    };
  }
  
  // Find path around weather using simplified pathfinding
  const safePath = findPathAroundObstacles(fromLat, fromLon, toLat, toLon, activeWeather);
  
  return {
    path: safePath,
    weatherEncountered: directPathBlocked.weatherEvents,
    totalDistance: calculatePathDistance(safePath),
    detourRequired: true,
    weatherAvoided: directPathBlocked.weatherEvents.map(w => WEATHER_TYPES[w.type]?.name).join(', ')
  };
}

/**
 * Check if a path intersects with severe weather
 */
function checkPathIntersectsWeather(fromLat, fromLon, toLat, toLon, weatherEvents) {
  const intersections = [];
  
  for (const weather of weatherEvents) {
    const weatherType = WEATHER_TYPES[weather.type];
    if (!weatherType?.blockTravel) continue;
    
    // Check if path intersects weather circle
    const intersects = lineIntersectsCircle(
      fromLat, fromLon, toLat, toLon,
      weather.centerLat, weather.centerLon, weather.radius / 111 // Convert km to degrees (approx)
    );
    
    if (intersects) {
      intersections.push(weather);
    }
  }
  
  return {
    blocked: intersections.length > 0,
    weatherEvents: intersections
  };
}

/**
 * Simple pathfinding around circular obstacles
 */
function findPathAroundObstacles(fromLat, fromLon, toLat, toLon, obstacles) {
  // For each obstacle that blocks the direct path, create waypoints around it
  let currentPath = [{lat: fromLat, lon: fromLon}];
  
  for (const obstacle of obstacles) {
    const weatherType = WEATHER_TYPES[obstacle.type];
    if (!weatherType?.blockTravel) continue;
    
    // Create waypoints around the weather system
    const safeDistance = (obstacle.radius / 111) * 1.2; // 20% safety margin, convert to degrees
    
    // Calculate perpendicular points to create detour
    const bearing = Math.atan2(toLon - fromLon, toLat - fromLat);
    const perpBearing1 = bearing + Math.PI / 2;
    const perpBearing2 = bearing - Math.PI / 2;
    
    // Two possible detour points
    const detour1 = {
      lat: obstacle.centerLat + Math.cos(perpBearing1) * safeDistance,
      lon: obstacle.centerLon + Math.sin(perpBearing1) * safeDistance
    };
    const detour2 = {
      lat: obstacle.centerLat + Math.cos(perpBearing2) * safeDistance,
      lon: obstacle.centerLon + Math.sin(perpBearing2) * safeDistance
    };
    
    // Choose closer detour point
    const dist1 = calculateDistance(fromLat, fromLon, detour1.lat, detour1.lon);
    const dist2 = calculateDistance(fromLat, fromLon, detour2.lat, detour2.lon);
    
    const chosenDetour = dist1 < dist2 ? detour1 : detour2;
    currentPath.push(chosenDetour);
  }
  
  // Add final destination
  currentPath.push({lat: toLat, lon: toLon});
  
  return currentPath;
}

/**
 * Check if line intersects circle (weather system)
 */
function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, radius) {
  // Distance from center to line
  const A = y2 - y1;
  const B = x1 - x2;
  const C = x2 * y1 - x1 * y2;
  
  const distance = Math.abs(A * cx + B * cy + C) / Math.sqrt(A * A + B * B);
  
  return distance <= radius;
}

/**
 * Calculate total distance of a path
 */
function calculatePathDistance(path) {
  let totalDistance = 0;
  for (let i = 1; i < path.length; i++) {
    totalDistance += calculateDistance(
      path[i-1].lat, path[i-1].lon,
      path[i].lat, path[i].lon
    );
  }
  return totalDistance;
}

/**
 * Get weather effects for a travel route
 */
function getWeatherEffectsForTravel(fromLat, fromLon, toLat, toLon) {
  const pathResult = findSafePathAroundWeather(fromLat, fromLon, toLat, toLon);
  
  // Check for weather along the safe path that affects travel time
  const weatherEffects = [];
  let totalTimeMultiplier = 1.0;
  
  const allWeather = getActiveWeather();
  for (const weather of allWeather) {
    const weatherType = WEATHER_TYPES[weather.type];
    if (!weatherType) continue;
    
    // Check if any point in path is affected by this weather
    for (const point of pathResult.path) {
      const distance = calculateDistance(point.lat, point.lon, weather.centerLat, weather.centerLon);
      if (distance <= weather.radius) {
        weatherEffects.push({
          weather: weather,
          weatherType: weatherType,
          effect: weatherType.travelTimeMultiplier
        });
        
        // Apply the worst weather effect encountered
        if (weatherType.travelTimeMultiplier > totalTimeMultiplier) {
          totalTimeMultiplier = weatherType.travelTimeMultiplier;
        }
        break;
      }
    }
  }
  
  return {
    ...pathResult,
    weatherEffects,
    timeMultiplier: totalTimeMultiplier,
    weatherDescription: weatherEffects.map(e => e.weatherType.name).join(', ') || 'Clear skies'
  };
}

/**
 * Record weather encounter for achievements/statistics
 */
function recordWeatherEncounter(userId, weatherEventId, encounterType) {
  try {
    // Use a transaction to ensure atomicity and prevent race conditions
    const transaction = db.transaction(() => {
      // First check if the weather event still exists and is active
      const weatherEvent = db.prepare('SELECT id, endTime FROM weather_events WHERE id = ? AND endTime > ?').get(weatherEventId, Date.now());
      if (!weatherEvent) {
        console.warn(`[weather] Cannot record encounter: weather event ${weatherEventId} no longer exists or has expired`);
        return false;
      }

      // Insert the encounter record
      db.prepare(`
        INSERT INTO weather_encounters (userId, weatherEventId, encounterType, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(userId, weatherEventId, encounterType, Date.now());

      return true;
    });

    const success = transaction();
    if (!success) {
      console.warn(`[weather] Skipped recording encounter for expired event ${weatherEventId}`);
    }
  } catch (error) {
    console.error('[weather] Error recording weather encounter:', error.message);
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      console.warn(`[weather] Foreign key constraint failed: weather event ${weatherEventId} was deleted during operation`);
    } else if (error.code === 'SQLITE_CORRUPT') {
      console.error('[weather] Database corruption detected during weather encounter recording');
    }
  }
}

/**
 * Create a weather event at specific coordinates (for staff commands)
 */
function createWeatherEvent(type, lat, lon, durationMinutes = 60, customRadius = null, client = null) {
  try {
    const weatherType = WEATHER_TYPES[type];
    if (!weatherType) {
      console.error(`[weather] Invalid weather type: ${type}`);
      return null;
    }

    const now = Date.now();
    const duration = durationMinutes * 60 * 1000; // Convert to milliseconds
    const expiresAt = now + duration;
    const radius = customRadius || (weatherType.radius * 5); // 5x larger radius
    const eventId = `weather_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Create weather event in database
    const result = db.prepare(`
      INSERT INTO weather_events (
        type, centerLat, centerLon, radius, 
        severity, startTime, endTime, specialEffects
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      type,
      lat,
      lon,
      radius,
      weatherType.severity,
      now,
      expiresAt,
      JSON.stringify(weatherType.specialEffects || [])
    );

    const weatherEvent = {
      id: result.lastInsertRowid,
      type,
      name: weatherType.name,
      centerLat: lat,
      centerLon: lon,
      radius,
      severity: weatherType.severity,
      startTime: now,
      endTime: expiresAt
    };

    console.log(`[weather] Created ${weatherType.name} at ${lat}, ${lon} (${radius}km radius, ${durationMinutes}min duration)`);

    // Send Discord notification for severe weather (severity 4+)
    if (client) {
      notifyDiscordWeatherEvent(weatherEvent, weatherType, client);
    }

    return weatherEvent;
  } catch (error) {
    console.error('[weather] Error creating weather event:', error.message);
    return null;
  }
}

/**
 * Remove a specific weather event by ID
 */
function removeWeatherEvent(eventId) {
  try {
    const result = db.prepare('DELETE FROM weather_events WHERE id = ?').run(eventId);
    if (result.changes > 0) {
      console.log(`[weather] Removed weather event: ${eventId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[weather] Error removing weather event:', error.message);
    return false;
  }
}

/**
 * Clear all active weather events
 */
function clearAllWeatherEvents() {
  try {
    const result = db.prepare('DELETE FROM weather_events WHERE endTime > ?').run(Date.now());
    console.log(`[weather] Cleared ${result.changes} active weather events`);
    return result.changes;
  } catch (error) {
    console.error('[weather] Error clearing weather events:', error.message);
    return 0;
  }
}

/**
 * Create weather event in a specific country/region
 */
async function createWeatherInCountry(type, countryName, client = null) {
  try {
    // Country coordinates database (major countries and regions)
    const COUNTRY_COORDS = {
      'usa': { lat: 39.8283, lon: -98.5795, name: 'United States' },
      'united states': { lat: 39.8283, lon: -98.5795, name: 'United States' },
      'canada': { lat: 56.1304, lon: -106.3468, name: 'Canada' },
      'uk': { lat: 55.3781, lon: -3.4360, name: 'United Kingdom' },
      'united kingdom': { lat: 55.3781, lon: -3.4360, name: 'United Kingdom' },
      'germany': { lat: 51.1657, lon: 10.4515, name: 'Germany' },
      'france': { lat: 46.2276, lon: 2.2137, name: 'France' },
      'japan': { lat: 36.2048, lon: 138.2529, name: 'Japan' },
      'australia': { lat: -25.2744, lon: 133.7751, name: 'Australia' },
      'brazil': { lat: -14.2350, lon: -51.9253, name: 'Brazil' },
      'china': { lat: 35.8617, lon: 104.1954, name: 'China' },
      'india': { lat: 20.5937, lon: 78.9629, name: 'India' },
      'russia': { lat: 61.5240, lon: 105.3188, name: 'Russia' },
      'mexico': { lat: 23.6345, lon: -102.5528, name: 'Mexico' },
      'spain': { lat: 40.4637, lon: -3.7492, name: 'Spain' },
      'italy': { lat: 41.8719, lon: 12.5674, name: 'Italy' },
      'norway': { lat: 60.4720, lon: 8.4689, name: 'Norway' },
      'sweden': { lat: 60.1282, lon: 18.6435, name: 'Sweden' },
      'finland': { lat: 61.9241, lon: 25.7482, name: 'Finland' },
      'iceland': { lat: 64.9631, lon: -19.0208, name: 'Iceland' },
      'greenland': { lat: 71.7069, lon: -42.6043, name: 'Greenland' },
      'south africa': { lat: -30.5595, lon: 22.9375, name: 'South Africa' },
      'egypt': { lat: 26.0975, lon: 30.0444, name: 'Egypt' },
      'antarctica': { lat: -82.8628, lon: 135.0000, name: 'Antarctica' },
      'pacific': { lat: 0.0000, lon: -160.0000, name: 'Pacific Ocean' },
      'atlantic': { lat: 0.0000, lon: -30.0000, name: 'Atlantic Ocean' }
    };

    const normalizedCountry = countryName.toLowerCase().trim();
    const countryData = COUNTRY_COORDS[normalizedCountry];

    if (!countryData) {
      return {
        success: false,
        message: `Country "${countryName}" not found. Available regions: ${Object.keys(COUNTRY_COORDS).join(', ')}`
      };
    }

    // Add some random offset to avoid exact same coordinates
    const latOffset = (Math.random() - 0.5) * 10; // ±5 degrees
    const lonOffset = (Math.random() - 0.5) * 20; // ±10 degrees
    
    const finalLat = Math.max(-90, Math.min(90, countryData.lat + latOffset));
    const finalLon = Math.max(-180, Math.min(180, countryData.lon + lonOffset));

    // Create the weather event with default 120 minute duration for regional events
    const weatherEvent = createWeatherEvent(type, finalLat, finalLon, 120, null, client);

    if (!weatherEvent) {
      return {
        success: false,
        message: 'Failed to create weather event'
      };
    }

    return {
      success: true,
      weatherEvent,
      coordinates: { lat: finalLat, lon: finalLon },
      region: countryData.name
    };
  } catch (error) {
    console.error('[weather] Error creating country weather:', error.message);
    return {
      success: false,
      message: `Error creating weather event: ${error.message}`
    };
  }
}

module.exports = {
  WEATHER_TYPES,
  initializeWeatherSystem,
  generateWeatherEvents,
  getActiveWeather,
  isLocationAffectedBySevereWeather,
  findSafePathAroundWeather,
  getWeatherEffectsForTravel,
  recordWeatherEncounter,
  calculateDistance,
  createWeatherEvent,
  removeWeatherEvent,
  clearAllWeatherEvents,
  createWeatherInCountry
};