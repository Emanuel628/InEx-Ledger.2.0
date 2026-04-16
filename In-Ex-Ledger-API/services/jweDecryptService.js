'use strict';

const crypto = require('crypto');

let _privateKey = null;

function getPrivateKey() {
  if (_privateKey) return _privateKey;
  const jwkJson = process.env.EXPORT_PRIVATE_KEY_JWK;
  if (!jwkJson) throw new Error('EXPORT_PRIVATE_KEY_JWK is not configured');
  const jwk = JSON.parse(jwkJson);
  _privateKey = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  return _privateKey;
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(padded + padding, 'base64');
}

function decryptJwe(jweToken) {
  const parts = jweToken.split('.');
  if (parts.length !== 5) throw new Error('Invalid JWE compact serialization');

  const [encodedHeader, encryptedKey, iv, ciphertext, tag] = parts;

  const encryptedKeyBuf = base64UrlDecode(encryptedKey);
  const ivBuf = base64UrlDecode(iv);
  const ciphertextBuf = base64UrlDecode(ciphertext);
  const tagBuf = base64UrlDecode(tag);
  const aad = Buffer.from(encodedHeader, 'ascii');

  const privateKey = getPrivateKey();
  const cek = crypto.privateDecrypt(
    { key: privateKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    encryptedKeyBuf
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', cek, ivBuf);
  decipher.setAuthTag(tagBuf);
  decipher.setAAD(aad);

  const plaintext = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { decryptJwe };
