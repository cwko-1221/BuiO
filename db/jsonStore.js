'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
// Tests may point at an isolated fixture without touching the real local data.
const DB_FILE = process.env.BUIO_JSON_DB_FILE
  ? path.resolve(process.env.BUIO_JSON_DB_FILE)
  : path.join(DATA_DIR, 'db.json');

let _data = null;

function load() {
  if (_data) return _data;
  const targetDir = path.dirname(DB_FILE);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    _data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    _data = { users: [], studentStats: [], questionLogs: [], _logId: 0 };
  }
  if (!Array.isArray(_data.users)) _data.users = [];
  if (!Array.isArray(_data.studentStats)) _data.studentStats = [];
  if (!Array.isArray(_data.questionLogs)) _data.questionLogs = [];
  if (typeof _data._logId !== 'number') {
    _data._logId = _data.questionLogs.reduce((m, l) => Math.max(m, l.id || 0), 0);
  }
  return _data;
}

/**
 * Codes Windows reports when something else has the file open for a moment.
 *
 * On this machine the store lives inside the repository, so Defender, the search indexer, git and
 * whatever editor is watching the tree all touch it. Any of them holding a handle for a few
 * milliseconds is enough to fail a write, which surfaced as "寵物樂園暫時未能完成操作" on a perfectly
 * ordinary change of outfit — and went away when the child pressed the button again.
 */
const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN']);
const ATTEMPTS = 5;

/** Block for a moment. save() is synchronous by contract, and its callers are mid-request. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Write the store out without ever leaving it half-written.
 *
 * Writing straight to the file truncates it before the first byte lands, so a write that failed
 * partway — which is exactly what the transient locks above cause — left the database empty or cut
 * in half, and the next start could not parse it. Writing a temporary file and renaming it over the
 * target instead means the real file is only ever replaced by a complete one; a rename within a
 * directory is atomic.
 */
function save() {
  const body = JSON.stringify(load(), null, 2);
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.writeFileSync(temp, body, 'utf8');
      fs.renameSync(temp, DB_FILE);
      return;
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch { /* nothing left to clean up */ }
      if (attempt >= ATTEMPTS || !BUSY.has(error.code)) throw error;
      pause(15 * (2 ** (attempt - 1)));
    }
  }
}

function nextLogId() {
  const d = load();
  d._logId += 1;
  return d._logId;
}

module.exports = { load, save, nextLogId, DB_FILE };
