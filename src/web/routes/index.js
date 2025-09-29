// src/web/routes/index.js
// Stabilized route mounting: export a function that accepts the Express app
// and mounts only known-safe routers (auth, optional paypal router style).
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');

function safeRequire(p) {
  try { return require(p); } catch (e) { return null; }
}

function mountRoutes(app) {
  // AUTH router (our auth.js exports an express.Router)
  try {
    const auth = safeRequire('./auth');
    if (auth) {
      // If it's a function with 3 args (req,res,next), it's a router; mount it.
      // If it's an object with .handle, it's also a router.
      if (typeof auth === 'function' || (auth && typeof auth.handle === 'function')) {
        app.use(auth);
        logger.info('[routes] auth mounted');
      } else if (auth && auth.default && (typeof auth.default === 'function' || typeof auth.default.handle === 'function')) {
        app.use(auth.default);
        logger.info('[routes] auth mounted (default export)');
      } else {
        logger.warn('[routes] auth export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] auth mount failed %s', e && e.stack || e);
  }

  // OPTIONAL PayPal route: support either a router export OR a mount(app) function.
  try {
    const paypal = safeRequire('./paypal');
    if (paypal) {
      if (typeof paypal === 'function' && paypal.length >= 1 && !paypal.handle) {
        // signature mount(app)
        paypal(app);
        logger.info('[routes] paypal mounted (mount function)');
      } else if (typeof paypal === 'function' || (paypal && typeof paypal.handle === 'function')) {
        app.use(paypal);
        logger.info('[routes] paypal mounted (router)');
      } else if (paypal && paypal.default) {
        const p = paypal.default;
        if (typeof p === 'function' && p.length >= 1 && !p.handle) {
          p(app);
          logger.info('[routes] paypal mounted (default mount function)');
        } else if (typeof p === 'function' || (p && typeof p.handle === 'function')) {
          app.use(p);
          logger.info('[routes] paypal mounted (default router)');
        } else {
          logger.warn('[routes] paypal export not mountable, skipping');
        }
      }
    }
  } catch (e) {
    logger.error('[routes] paypal mount failed %s', e && e.stack || e);
  }

  // STATIC router (serves static files from /static)
  try {
    const staticRouter = safeRequire('./static');
    if (staticRouter) {
      if (typeof staticRouter === 'function' || (staticRouter && typeof staticRouter.handle === 'function')) {
        app.use(staticRouter);
        logger.info('[routes] static mounted');
      } else if (staticRouter && staticRouter.default && (typeof staticRouter.default === 'function' || typeof staticRouter.default.handle === 'function')) {
        app.use(staticRouter.default);
        logger.info('[routes] static mounted (default export)');
      } else {
        logger.warn('[routes] static export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] static mount failed %s', e && e.stack || e);
  }

  // STORE router (handles /store/* endpoints)
  try {
    const store = safeRequire('./store');
    if (store) {
      if (typeof store === 'function' || (store && typeof store.handle === 'function')) {
        app.use(store);
        logger.info('[routes] store mounted');
      } else if (store && store.default && (typeof store.default === 'function' || typeof store.default.handle === 'function')) {
        app.use(store.default);
        logger.info('[routes] store mounted (default export)');
      } else {
        logger.warn('[routes] store export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] store mount failed %s', e && e.stack || e);
  }

  // API router (handles /api/* endpoints)
  try {
    const api = safeRequire('./api');
    if (api) {
      if (typeof api === 'function' || (api && typeof api.handle === 'function')) {
        app.use(api);
        logger.info('[routes] api mounted');
      } else if (api && api.default && (typeof api.default === 'function' || typeof api.default.handle === 'function')) {
        app.use(api.default);
        logger.info('[routes] api mounted (default export)');
      } else {
        logger.warn('[routes] api export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] api mount failed %s', e && e.stack || e);
  }

  // STATUS router (handles /status/* endpoints)
  try {
    const status = safeRequire('./status');
    if (status) {
      if (typeof status === 'function' || (status && typeof status.handle === 'function')) {
        app.use('/status', status);
        logger.info('[routes] status mounted');
      } else if (status && status.default && (typeof status.default === 'function' || typeof status.default.handle === 'function')) {
        app.use('/status', status.default);
        logger.info('[routes] status mounted (default export)');
      } else {
        logger.warn('[routes] status export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] status mount failed %s', e && e.stack || e);
  }

  // REAL-TIME STATS API router (handles /api/realtime/* endpoints)
  try {
    const realtimeStats = safeRequire('./realtime-stats');
    if (realtimeStats) {
      if (typeof realtimeStats === 'function' || (realtimeStats && typeof realtimeStats.handle === 'function')) {
        app.use('/api/realtime', realtimeStats);
        logger.info('[routes] realtime-stats mounted');
      } else if (realtimeStats && realtimeStats.default && (typeof realtimeStats.default === 'function' || typeof realtimeStats.default.handle === 'function')) {
        app.use('/api/realtime', realtimeStats.default);
        logger.info('[routes] realtime-stats mounted (default export)');
      } else {
        logger.warn('[routes] realtime-stats export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] realtime-stats mount failed %s', e && e.stack || e);
  }

  // PAGES router (handles root path)
  try {
    const pages = safeRequire('./pages');
    if (pages) {
      if (typeof pages === 'function' || (pages && typeof pages.handle === 'function')) {
        app.use(pages);
        logger.info('[routes] pages mounted');
      } else if (pages && pages.default && (typeof pages.default === 'function' || typeof pages.default.handle === 'function')) {
        app.use(pages.default);
        logger.info('[routes] pages mounted (default export)');
      } else {
        logger.warn('[routes] pages export not a router, skipping');
      }
    }
  } catch (e) {
    logger.error('[routes] pages mount failed %s', e && e.stack || e);
  }
}

module.exports = mountRoutes;
module.exports.default = mountRoutes;
