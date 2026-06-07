/**
 * Database Module — redirects to root JSON database
 * All data stored in data/db.json (no external PostgreSQL needed)
 */
const db = require('../../db');

// Re-export everything from the root db module
module.exports = db;
