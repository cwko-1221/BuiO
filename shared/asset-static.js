'use strict';
const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
function assetStatic(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  return [async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.headers.range) return next();
    let relative;
    try { relative = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return next(); }
    if (!/\.(js|css|json|svg|wasm)$/i.test(relative) || relative.split('/').some(part => part.startsWith('.')) || /[\\:\0]/.test(relative)) return next();
    const file = path.resolve(absoluteRoot, relative);
    if (!file.startsWith(absoluteRoot + path.sep)) return next();
    res.vary('Accept-Encoding');
    const encoding = req.acceptsEncodings('br', 'gzip');
    if (!encoding) return next();
    const suffix = encoding === 'br' ? '.br' : '.gz';
    try {
      const [source, compressed] = await Promise.all([fs.stat(file), fs.stat(file + suffix)]);
      if (!source.isFile() || !compressed.isFile() || compressed.mtimeMs < source.mtimeMs || compressed.size >= source.size) return next();
      res.type(path.extname(relative));
      res.set('Content-Encoding', encoding);
      options.setHeaders?.(res, file, source);
      res.sendFile(relative + suffix, { root: absoluteRoot, maxAge: options.maxAge || 0, immutable: options.immutable || false }, error => {
        if (error) next(error);
      });
    } catch { next(); }
  }, express.static(absoluteRoot, options)];
}
module.exports = { assetStatic };
