// src/utils/fetchSafe.js
// Lightweight fetch wrapper that prefers Node 18+/20+/22 global fetch,
// and lazily falls back to node-fetch (ESM) only if needed.
// CommonJS export for compatibility with require().
let _fetch = (typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch : null;

module.exports = async function fetchSafe(url, options) {
  if (!_fetch) {
    // Lazy dynamic import so CommonJS can load ESM without warnings.
    const mod = await import('node-fetch');
    _fetch = mod.default || mod;
  }
  return _fetch(url, options);
};
