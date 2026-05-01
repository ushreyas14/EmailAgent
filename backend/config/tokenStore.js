/**
 * tokenStore.js
 * Simple JSON-file-backed per-user token store.
 * Each key is the user's email address.
 * In production, replace with MongoDB or Redis.
 */

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'tokens.json');

/** Read the full store from disk, return {} if missing/corrupt */
function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Persist the store to disk */
function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Save (or overwrite) tokens for a user.
 * @param {string} email
 * @param {{ access_token: string, refresh_token: string, expiry_date?: number }} tokens
 */
function saveTokens(email, tokens) {
  const store = readStore();
  store[email] = {
    ...(store[email] || {}),
    ...tokens,
    updatedAt: new Date().toISOString()
  };
  writeStore(store);
}

/**
 * Load tokens for a user. Returns null if not found.
 * @param {string} email
 * @returns {{ access_token: string, refresh_token: string } | null}
 */
function getTokens(email) {
  const store = readStore();
  return store[email] || null;
}

/**
 * Remove a user's tokens (e.g. on logout / revoke).
 * @param {string} email
 */
function deleteTokens(email) {
  const store = readStore();
  delete store[email];
  writeStore(store);
}

/**
 * List all known user emails in the store.
 * @returns {string[]}
 */
function listUsers() {
  return Object.keys(readStore());
}

module.exports = { saveTokens, getTokens, deleteTokens, listUsers };
