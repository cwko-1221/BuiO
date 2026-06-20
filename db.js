'use strict';

/**
 * Backwards-compatible shim.
 *
 * The real data layer now lives in:
 *   - /config.js                       — mode selection (postgres vs json)
 *   - /db/jsonStore.js                 — JSON file accessor
 *   - /math-app/db/database.js         — Postgres pool + transactions
 *   - /math-app/repositories/*.repo.js — domain methods
 *
 * Only the bits server.js still reads (health/db-status, seed-on-boot)
 * are exposed here.
 */

const bcrypt = require('bcryptjs');
const config = require('./config');
const store = require('./db/jsonStore');
const { ALL_TAGS } = require('./math-app/engine/questionGenerator');

function seedDefaultsIfEmpty() {
  if (config.db.mode !== 'json') return;
  const d = store.load();
  if (d.users.length > 0) return;
  const hash = bcrypt.hashSync('123456', 10);
  const defaults = [
    { studentid: 'S001', name: '王小明', role: 'student' },
    { studentid: 'S002', name: '李小華', role: 'student' },
    { studentid: 'S003', name: '張小美', role: 'student' },
    { studentid: 'S004', name: '陳大偉', role: 'student' },
    { studentid: 'S005', name: '林小芬', role: 'student' },
    { studentid: 'T001', name: '陳老師', role: 'teacher' },
  ];
  for (const u of defaults) {
    d.users.push({ ...u, passwordhash: hash, language: 'zh-HK' });
  }
  for (const u of d.users.filter(x => x.role === 'student')) {
    for (const tag of ALL_TAGS) {
      d.studentStats.push({ studentid: u.studentid, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 });
    }
  }
  store.save();
}

if (config.db.mode === 'json') {
  seedDefaultsIfEmpty();
  console.log(`✅ JSON DB ready (${store.load().users.length} users, ${store.load().questionLogs.length} logs)`);
}

module.exports = {
  _load: store.load,
  _save: store.save,
};
