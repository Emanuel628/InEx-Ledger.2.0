'use strict';

const { encrypt, decrypt } = require('./encryptionService');

function logDecryptFailure(err) {
  console.warn('[InEx][WARN] GST/HST number decrypt failed', {
    errorName: err?.name || 'Error',
    message: err?.message || 'Unknown decrypt error'
  });
}

function encryptGstHstNumber(value) {
  if (!value) return value;
  return encrypt(value);
}

function decryptGstHstNumber(value) {
  if (!value) return value;
  try {
    return decrypt(value);
  } catch (err) {
    logDecryptFailure(err);
    return null;
  }
}

module.exports = {
  encryptGstHstNumber,
  decryptGstHstNumber
};
