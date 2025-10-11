/**
 * QuestCord Authentication Routes
 * ===============================
 * Handles Discord OAuth authentication and user session management.
 * This module provides a complete authentication system including:
 * 
 * **Core Authentication Features:**
 * - Discord OAuth 2.0 flow implementation
 * - Secure session management with CSRF protection
 * - State parameter validation for OAuth security
 * - User profile and game data integration
 * 
 * **API Endpoints:**
 * - /auth/discord - Initiate OAuth flow
 * - /auth/discord/callback - Process OAuth callback
 * - /api/whoami - Get current user session data
 * - /auth/logout - End user session
 * 
 * **Game Integration:**
 * - Player database record management
 * - Travel status tracking with real-time position
 * - Inventory and game state synchronization
 * - Role-based permissions and member status
 * 
 * **Security Features:**
 * - CSRF state parameter validation
 * - Session expiration management
 * - Rate limiting on authentication endpoints
 * - Secure cookie configuration
 */

// Import Express framework for creating authentication routes
const express = require('express');
// Import session middleware for secure session management
const session = require('express-session');
// Import crypto module for generating secure random tokens
const crypto = require('crypto');
// Import logger for authentication event tracking
const logger = require('../../utils/logger');
// Import rate limiting middleware for authentication endpoints
const { rateLimit } = require('../security');

// Create Express router instance for authentication routes
const router = express.Router();

// Discord OAuth config
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || process.env.OAUTH_REDIRECT_URI;

// In-memory state storage (simple approach)
const pendingStates = new Map();

// Start OAuth flow
router.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');

  // Store state with expiration
  pendingStates.set(state, Date.now());
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000); // 10 min expiry

  const authUrl = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: state
  });

  logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.aqua('🔐 OAUTH FLOW STARTED');
  logger.aqua('💻 IP: %s', req.ip || req.connection.remoteAddress);
  logger.aqua('🔑 State: %s', state.substring(0, 16) + '...');
  logger.aqua('⏰ Time: %s', new Date().toISOString());

  res.redirect(authUrl);
});

// OAuth callback
router.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;

  // OAuth callback received

  // Validate state
  if (!state || !pendingStates.has(state)) {
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('⚠️  OAUTH FAILED: Invalid State');
    logger.warn('💻 IP: %s', req.ip || req.connection.remoteAddress);
    logger.warn('🔑 State: %s', state ? state.substring(0, 16) + '...' : 'missing');
    logger.warn('⏰ Time: %s', new Date().toISOString());
    return res.status(400).send('Invalid state');
  }
  
  pendingStates.delete(state);

  if (!code) {
    // Missing authorization code
    return res.status(400).send('No authorization code');
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      // Token exchange failed
      return res.status(500).send('Token exchange failed');
    }

    const tokens = await tokenResponse.json();
    // Tokens obtained, fetching user

    // Get user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!userResponse.ok) {
      // User fetch failed
      return res.status(500).send('User fetch failed');
    }

    const user = await userResponse.json();

    logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.aqua('✅ USER AUTHENTICATED');
    logger.aqua('👤 User: %s (@%s)', user.username, user.id);
    logger.aqua('🎭 Global Name: %s', user.global_name || 'None');
    logger.aqua('💻 IP: %s', req.ip || req.connection.remoteAddress);
    logger.aqua('⏰ Time: %s', new Date().toISOString());

    // Store in session
    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      global_name: user.global_name
    };

    // Redirect to home
    res.redirect('/');
    
  } catch (error) {
    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.error('❌ OAUTH ERROR');
    logger.error('💻 IP: %s', req.ip || req.connection.remoteAddress);
    logger.error('⚠️  Error: %s', error.message);
    logger.error('📍 Stack: %s', error.stack);
    logger.error('⏰ Time: %s', new Date().toISOString());
    res.status(500).send('Authentication failed');
  }
});

// Check auth status - return format that frontend expects
router.get('/api/whoami', rateLimit(60, 60000), async (req, res) => {
  try {
    // console.log('Whoami called - session user:', req.session?.user?.username || 'none'); // Disabled to reduce spam
    
    if (!req.session?.user) {
      return res.json({ user: null });
    }

    const u = req.session.user;

    // Import required functions
    const { db } = require('../../utils/store_sqlite');
    const { fetchRoleLevel, getMemberRoleIds, ensurePlayerRow } = require('../util');

    // Ensure player exists with proper spawn location
    ensurePlayerRow(u);

    // Role + regen + member roles
    const roleLevel = await fetchRoleLevel(u.id);
    const memberRoles = await getMemberRoleIds(u.id);
    try {
      const { applyRegenForUser } = require('../../utils/regen');
      await applyRegenForUser(u.id);
    } catch {}

    // Player + inventory
    const player = db.prepare(`
      SELECT userId, name, drakari, locationGuildId,
             travelArrivalAt, travelFromGuildId, travelStartAt,
             vehicle, health, stamina, staminaUpdatedAt, gems
      FROM players WHERE userId=?
    `).get(u.id) || null;
    const inv = db.prepare('SELECT itemId, qty FROM inventory WHERE userId=? ORDER BY itemId').all(u.id);

    // Travel status
    let travel = null;
    if (player && player.travelArrivalAt && player.travelArrivalAt > Date.now()) {
      // Handle travel origin (could be server or landmark)
      let from = null;
      if (player.travelFromGuildId && player.travelFromGuildId.startsWith('landmark_')) {
        // Origin is a landmark
        const landmarkId = player.travelFromGuildId.replace('landmark_', '');
        const { getPOIById } = require('../../utils/pois');
        const poi = getPOIById(landmarkId);
        if (poi) {
          from = { guildId: player.travelFromGuildId, name: poi.name, lat: poi.lat, lon: poi.lon };
        }
      } else {
        // Origin is a server
        from = db.prepare('SELECT guildId, name, lat, lon FROM servers WHERE guildId=?').get(player.travelFromGuildId);
      }
      
      // Handle travel destination (could be server or landmark)
      let to = null;
      if (player.locationGuildId && player.locationGuildId.startsWith('landmark_')) {
        // Destination is a landmark
        const landmarkId = player.locationGuildId.replace('landmark_', '');
        const { getPOIById } = require('../../utils/pois');
        const poi = getPOIById(landmarkId);
        if (poi) {
          to = { guildId: player.locationGuildId, name: poi.name, lat: poi.lat, lon: poi.lon };
        }
      } else {
        // Destination is a server
        to = db.prepare('SELECT guildId, name, lat, lon FROM servers WHERE guildId=?').get(player.locationGuildId);
      }
      
      if (from && to) {
        const total = Math.max(1, player.travelArrivalAt - player.travelStartAt);
        const progress = Math.min(1, Math.max(0, (Date.now() - player.travelStartAt) / total));
        const lat = from.lat + (to.lat - from.lat) * progress;
        const lon = from.lon + (to.lon - from.lon) * progress;
        travel = {
          from: { guildId: from.guildId, name: from.name, lat: from.lat, lon: from.lon },
          to: { guildId: to.guildId, name: to.name, lat: to.lat, lon: to.lon },
          position: { lat, lon },
          arrivalAt: player.travelArrivalAt,
          progress
        };
      }
    }

    // Get current location server name and coordinates
    let currentLocationServer = null;
    if (player && player.locationGuildId) {
      currentLocationServer = db.prepare('SELECT guildId, name, lat, lon FROM servers WHERE guildId=?').get(player.locationGuildId);
    }

    res.json({ 
      user: u,
      roleLevel,
      memberRoles,
      player,
      inventory: inv,
      travel,
      currentLocationServer
    });

  } catch (e) {
    console.error('Whoami error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// Login aliases
router.get('/auth/login', (req, res) => res.redirect('/auth/discord'));
router.get('/login', (req, res) => res.redirect('/auth/discord'));

// Logout (POST for API, GET for direct links)
router.post('/auth/logout', (req, res) => {
  const username = req.session?.user?.username || 'Unknown';
  const userId = req.session?.user?.id || 'Unknown';

  logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.aqua('👋 USER LOGGED OUT');
  logger.aqua('👤 User: %s (@%s)', username, userId);
  logger.aqua('💻 IP: %s', req.ip || req.connection.remoteAddress);
  logger.aqua('⏰ Time: %s', new Date().toISOString());

  req.session.destroy();
  res.json({ success: true });
});

router.get('/auth/logout', (req, res) => {
  const username = req.session?.user?.username || 'Unknown';
  const userId = req.session?.user?.id || 'Unknown';

  logger.aqua('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.aqua('👋 USER LOGGED OUT');
  logger.aqua('👤 User: %s (@%s)', username, userId);
  logger.aqua('💻 IP: %s', req.ip || req.connection.remoteAddress);
  logger.aqua('⏰ Time: %s', new Date().toISOString());

  req.session.destroy();
  res.redirect('/');
});

// Debug endpoint removed for security

module.exports = router;