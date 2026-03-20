const crypto = require('crypto');

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildExcerpt(content) {
  return content.length > 96 ? `${content.slice(0, 96)}...` : content;
}

function buildCursorFromIso(value) {
  return Buffer.from(value).toString('base64url');
}

function parseCursor(cursor) {
  if (!cursor) {
    return null;
  }

  return Buffer.from(cursor, 'base64url').toString('utf8');
}

module.exports = {
  buildCursorFromIso,
  buildExcerpt,
  createId,
  nowIso,
  parseCursor,
};
