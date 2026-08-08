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

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(load(), null, 2), 'utf8');
}

function nextLogId() {
  const d = load();
  d._logId += 1;
  return d._logId;
}

module.exports = { load, save, nextLogId, DB_FILE };
