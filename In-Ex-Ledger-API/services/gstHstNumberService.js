'use strict';

const { encrypt, decrypt } = require('./encryptionService');

function encryptGstHstNumber(value) {
  if (!value) return value;
  return encrypt(value);
}

function decryptGstHstNumber(value) {
  if (!value) return value;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

module.exports = {
  encryptGstHstNumber,
  decryptGstHstNumber
};
