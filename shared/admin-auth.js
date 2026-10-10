'use strict';
const crypto = require('node:crypto');
const config = require('../config');
function revision() {
  return config.adminPassword ? crypto.createHmac('sha256', config.session.secret)
    .update(`admin:${config.adminPassword}`).digest('hex') : null;
}
function matches(value) {
  if (!config.adminPassword) return false;
  const received = Buffer.from(String(value || ''));
  const expected = Buffer.from(config.adminPassword);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
function unlocked(session) {
  return Boolean(session?.adminUnlocked && revision() && session.adminRevision === revision());
}
module.exports = { matches, revision, unlocked };
