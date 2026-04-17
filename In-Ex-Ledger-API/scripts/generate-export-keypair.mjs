#!/usr/bin/env node
/**
 * Generates an RSA-OAEP-256 key pair for secure Tax ID PDF export.
 *
 * Usage:
 *   node scripts/generate-export-keypair.mjs
 *
 * Copy the output into your .env file:
 *   EXPORT_PUBLIC_KEY_JWK=<public key JSON, single line>
 *   EXPORT_PRIVATE_KEY_JWK=<private key JSON, single line>
 *   EXPORT_PUBLIC_KEY_KID=export-key-1
 *
 * Keep EXPORT_PRIVATE_KEY_JWK secret — it decrypts the Tax ID on the server.
 * EXPORT_PUBLIC_KEY_JWK is served to the browser and can be public.
 */

import { webcrypto } from 'node:crypto';

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  {
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  },
  true,
  ['encrypt', 'decrypt']
);

const publicJwk = await webcrypto.subtle.exportKey('jwk', publicKey);
const privateJwk = await webcrypto.subtle.exportKey('jwk', privateKey);

console.log('\nAdd these to your .env:\n');
console.log(`EXPORT_PUBLIC_KEY_JWK='${JSON.stringify(publicJwk)}'`);
console.log(`EXPORT_PUBLIC_KEY_KID=export-key-1`);
console.log(`EXPORT_PRIVATE_KEY_JWK='${JSON.stringify(privateJwk)}'`);
console.log('\nKeep EXPORT_PRIVATE_KEY_JWK secret — never commit it.\n');
