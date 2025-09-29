/**
 * QuestCord Discord OAuth Authentication Routes
 * =============================================
 * Implements Discord OAuth 2.0 flow for user authentication in the QuestCord web interface.
 * This module provides drop-in OAuth functionality that can be easily integrated into any Express app.
 * 
 * **OAuth Flow:**
 * 1. User clicks login -> redirected to Discord OAuth authorization
 * 2. User grants permissions -> Discord redirects back with authorization code  
 * 3. Server exchanges code for access token with Discord API
 * 4. Server fetches user profile using access token
 * 5. User session is established with profile data and role permissions
 * 
 * **Integration Requirements:**
 * - Must be mounted AFTER session middleware is configured
 * - Must be mounted BEFORE static file serving and catch-all routes
 * - Requires 'trust proxy' setting for proper IP detection behind proxies
 * 
 * **Usage in server.js:**
 * ```javascript
 * app.set('trust proxy', 1);
 * require('./oauthRoutes')(app, { fetchRoleLevel });
 * ```
 * 
 * **Required Environment Variables:**
 * - DISCORD_CLIENT_ID: Discord application client ID
 * - DISCORD_CLIENT_SECRET: Discord application client secret  
 * - DISCORD_REDIRECT_URI: OAuth callback URL (e.g., https://questcord.fun/auth/discord/callback)
 * - COOKIE_DOMAIN: Domain for session cookies (optional, used in session config)
 * 
 * **Security Features:**
 * - Secure token exchange with Discord API
 * - Session-based authentication state management
 * - Error handling for all OAuth failure scenarios
 * - Role level integration for permission management
 */

// Import URL utilities for building OAuth URLs and parsing parameters
const { URL, URLSearchParams } = require('url');

/**
 * OAuth Routes Configuration Function
 * Mounts Discord OAuth authentication routes on the provided Express app
 * @param {Object} app - Express application instance
 * @param {Object} deps - Dependencies object
 * @param {Function} deps.fetchRoleLevel - Function to fetch user role level (optional)
 */
module.exports = function oauthRoutes(app, deps = {}) {
  // Extract role level fetcher or use default that returns 'User' role
  const fetchRoleLevel = deps.fetchRoleLevel || (async () => 'User');

  // Load Discord OAuth credentials from environment variables
  // Support multiple variable names for compatibility with different setups
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
  const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI;

  /**
   * Builds the Discord OAuth authorization URL
   * Constructs the URL users are redirected to for Discord authentication
   * @returns {string} - Complete Discord OAuth authorization URL
   */
  function buildAuthorizeUrl() {
    // Create Discord OAuth authorization endpoint URL
    const u = new URL('https://discord.com/oauth2/authorize');
    
    // Add required OAuth parameters
    u.search = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID || '',       // Discord application ID
      redirect_uri: DISCORD_REDIRECT_URI || '', // Where Discord should redirect back
      response_type: 'code',                    // OAuth flow type (authorization code)
      scope: 'identify guilds'                  // Permissions requested (user ID and server list)
    }).toString();
    
    return u.toString();
  }

  /**
   * Login Route Handler
   * GET /auth/login
   * Initiates the Discord OAuth flow by redirecting users to Discord's authorization page
   */
  app.get('/auth/login', (req, res) => {
    // Validate that required OAuth credentials are configured
    if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
      console.error('[oauth] Misconfigured env. Need DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI');
      return res.status(500).send('Auth error: misconfigured env');
    }
    
    // Redirect user to Discord OAuth authorization page
    res.redirect(buildAuthorizeUrl());
  });

  /**
   * OAuth Callback Handler
   * Processes the callback from Discord after user authorization
   * Exchanges authorization code for access token and fetches user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async function handleCallback(req, res) {
    // Extract authorization code from Discord's callback
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');
    
    try {
      // Step 1: Exchange authorization code for access token
      const tokenParams = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID || '',
        client_secret: DISCORD_CLIENT_SECRET || '',
        grant_type: 'authorization_code',        // OAuth 2.0 authorization code flow
        code,                                   // Authorization code from Discord
        redirect_uri: DISCORD_REDIRECT_URI || '' // Must match the registered redirect URI
      });

      // Make token exchange request to Discord API
      const tRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams
      });
      
      // Parse token response with error handling
      const tok = await tRes.json().catch(() => ({}));
      if (!tRes.ok || !tok.access_token) {
        console.error('[oauth] Token exchange failed', { status: tRes.status, tok });
        return res.status(500).send('Auth error');
      }

      // Step 2: Fetch user profile using access token
      const uRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tok.access_token}` }
      });
      
      // Parse user data with error handling
      const user = await uRes.json().catch(() => ({}));
      if (!uRes.ok || !user.id) {
        console.error('[oauth] User fetch failed', { status: uRes.status, user });
        return res.status(500).send('Auth error');
      }

      // Step 3: Establish user session with profile data
      req.session.user = { 
        id: user.id, 
        username: user.username, 
        avatar: user.avatar 
      };
      
      // Step 4: Fetch and cache user role level for permissions
      try { 
        req.session.roleLevel = await fetchRoleLevel(user.id); 
      } catch {} // Ignore role fetch errors, will default to 'User'

      // Redirect to home page after successful authentication
      res.redirect('/');
    } catch (e) {
      // Handle any unexpected errors during the OAuth process
      console.error('[oauth] Exception', e);
      res.status(500).send('Auth error');
    }
  }

  /**
   * OAuth Callback Route Handlers
   * Multiple routes for flexibility in callback URL configuration
   * Both routes use the same callback handler for processing OAuth responses
   */
  app.get('/auth/callback', handleCallback);          // Generic callback route
  app.get('/auth/discord/callback', handleCallback);  // Discord-specific callback route

  /**
   * Debug Route Handler
   * GET /auth/debug
   * Provides OAuth configuration information for debugging and setup verification
   * Returns current redirect URI and authorization URL for troubleshooting
   */
  app.get('/auth/debug', (req, res) => {
    res.json({
      redirect_uri_env: DISCORD_REDIRECT_URI || null,  // Current redirect URI setting
      authorize_url: buildAuthorizeUrl()                // Complete authorization URL
    });
  });
};
