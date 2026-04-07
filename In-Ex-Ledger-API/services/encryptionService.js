'use strict';

/**
 * EncryptionService — AES-256-GCM symmetric encryption for sensitive database fields.
 *
 * Usage:
 *   const { encrypt, decrypt, isEncrypted } = require('./encryptionService');
 *   const ciphertext = encrypt('sensitive value');   // stored in DB
 *   const plaintext  = decrypt(ciphertext);          // retrieved from DB
 *
 * The 32-byte key must be supplied as a hex-encoded string in the
 * FIELD_ENCRYPTION_KEY environment variable (64 hex characters).
 * Generate one with:  node -e "require('crypto').randomBytes(32).toString('hex')|0" 
 * (or: openssl rand -hex 32)
 *
 * Encrypted payloads are stored as:
 *   "enc:v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>"
 * The "enc:v1:" prefix allows safe detection and graceful plain-text fallback.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;           // 96-bit IV — recommended for GCM
const AUTH_TAG_BYTES = 16;     // 128-bit authentication tag
const ENCRYPTED_PREFIX = 'enc:v1:';

let _key = null;

function getKey() {
  if (_key) return _key;

  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'Missing required environment variable: FIELD_ENCRYPTION_KEY ' +
      '(must be a 64-character hex string representing a 32-byte AES key)'
    );
  }

  const keyBuf = Buffer.from(raw.trim(), 'hex');
  if (keyBuf.length !== 32) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${keyBuf.length})`
    );
  }

  _key = keyBuf;
  return _key;
}

/**
 * Encrypts a plain-text string.
 * @param {string} plaintext
 * @returns {string}  encoded ciphertext string safe for database storage
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;

  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX +
    iv.toString('base64') + ':' +
    authTag.toString('base64') + ':' +
    encrypted.toString('base64')
  );
}

/**
 * Decrypts an encoded ciphertext string produced by encrypt().
 * If the value does not carry the encrypted prefix it is returned as-is,
 * allowing a graceful transition from plain-text legacy data.
 * @param {string} value
 * @returns {string}
 */
function decrypt(value) {
  if (value === null || value === undefined) return value;
  if (!String(value).startsWith(ENCRYPTED_PREFIX)) {
    // Plain-text legacy value — return unchanged
    return value;
  }

  const key = getKey();
  const withoutPrefix = value.slice(ENCRYPTED_PREFIX.length);
  const parts = withoutPrefix.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted field payload');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * Returns true if the value was produced by encrypt().
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
