'use strict';
const { parentPort } = require('node:worker_threads');
const bcrypt = require('bcryptjs');
parentPort.on('message', ({ id, operation, password, value }) => {
  try {
    const result = operation === 'compare' ? bcrypt.compareSync(password, value) : bcrypt.hashSync(password, value);
    parentPort.postMessage({ id, result });
  } catch { parentPort.postMessage({ id, failed: true }); }
});
