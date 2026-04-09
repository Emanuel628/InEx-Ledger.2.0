'use strict';

/**
 * taxIdService — Tax ID encrypt/decrypt using FIELD_ENCRYPTION_KEY via encryptionService.
 *
 * Supports both:
 *   - Legacy format: "enc:<iv_b64>:<authTag_b64>:<ciphertext_b64>"  (JWT_SECRET-derived key)
 *   - Current format: "enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>" (FIELD_ENCRYPTION_KEY)
 *
 * New values are always written in the current format.
 * Existing legacy values can still be read via the legacy fallback path.
 */

const crypto = require('crypto');
const { encrypt, decrypt } = require('./encryptionService');

const LEGACY_PREFIX = 'enc:';
const CURRENT_PREFIX = 'enc:v1:';

function getLegacyKey() {
  const secret = process.env.JWT_SECRET || '';
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptLegacy(stored) {
  try {
    const parts = stored.slice(LEGACY_PREFIX.length).split(':');
    if (parts.length !== 3) return stored;
    const [ivB64, authTagB64, encryptedB64] = parts;
    const key = getLegacyKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Encrypt a tax ID using FIELD_ENCRYPTION_KEY (via encryptionService).
 * @param {string} plaintext
 * @returns {string} encrypted string with "enc:v1:" prefix
 */
function encryptTaxId(plaintext) {
  if (!plaintext) return plaintext;
  return encrypt(plaintext);
}

/**
 * Decrypt a tax ID. Handles both legacy (enc:) and current (enc:v1:) formats.
 * Plain-text values are returned unchanged.
 * @param {string} stored
 * @returns {string|null}
 */
function decryptTaxId(stored) {
  if (!stored) return stored;
  if (stored.startsWith(CURRENT_PREFIX)) {
    try {
      return decrypt(stored);
    } catch {
      return null;
    }
  }
  if (stored.startsWith(LEGACY_PREFIX)) {
    return decryptLegacy(stored);
  }
  return stored;
}

module.exports = { encryptTaxId, decryptTaxId };
