const crypto = require("crypto");

const MFA_ISSUER = process.env.MFA_ISSUER || "InEx Ledger";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MFA_SECRET_BYTES = 20;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 8;

function deriveEncryptionKey() {
  const secret = String(process.env.JWT_SECRET || "");
  if (!secret) {
    throw new Error("JWT_SECRET is required for MFA encryption");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(input) {
  const normalized = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").trim();
}

function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function constantTimeHexEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function generateSecret() {
  return encodeBase32(crypto.randomBytes(MFA_SECRET_BYTES));
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

function decryptSecret(payload) {
  const [ivPart, tagPart, encryptedPart] = String(payload || "").split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Invalid MFA secret payload");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function generateHotp(secret, counter) {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, "0");
}

function verifyTotp(secret, code, window = TOTP_WINDOW) {
  const normalizedCode = normalizeCode(code);
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    if (generateHotp(secret, currentCounter + offset) === normalizedCode) {
      return true;
    }
  }
  return false;
}

function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const partA = crypto.randomBytes(2).toString("hex").toUpperCase();
    const partB = crypto.randomBytes(2).toString("hex").toUpperCase();
    return `${partA}-${partB}`;
  });
}

function hashRecoveryCodes(codes) {
  return (Array.isArray(codes) ? codes : []).map(hashRecoveryCode);
}

function consumeRecoveryCode(hashedCodes, code) {
  const candidate = hashRecoveryCode(code);
  const existing = Array.isArray(hashedCodes) ? hashedCodes.map(String) : [];
  const index = existing.findIndex((value) => constantTimeHexEquals(value, candidate));

  if (index === -1) {
    return null;
  }

  return existing.filter((_, currentIndex) => currentIndex !== index);
}

function buildOtpAuthUrl(email, secret) {
  const label = `${MFA_ISSUER}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer: MFA_ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function serializeRecoveryCodes(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [];
}

module.exports = {
  buildOtpAuthUrl,
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCodes,
  serializeRecoveryCodes,
  verifyTotp
};
