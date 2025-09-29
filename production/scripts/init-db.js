// The SQLite store creates tables on first require; this script is a no-op initializer.
require('dotenv').config();
require('../src/utils/store_sqlite');
console.log('[init] Database ready.');
