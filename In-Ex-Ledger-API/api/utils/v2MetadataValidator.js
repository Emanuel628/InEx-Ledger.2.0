"use strict";

const MAX_METADATA_BYTES = 4096;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS_PER_OBJECT = 25;
const MAX_METADATA_ARRAY_LENGTH = 25;
const MAX_METADATA_STRING_LENGTH = 500;
const METADATA_KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function validateMetadataNode(value, depth, path) {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.length <= MAX_METADATA_STRING_LENGTH
      ? null
      : `${path} strings must be ${MAX_METADATA_STRING_LENGTH} characters or fewer.`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? null : `${path} numbers must be finite.`;
  }

  if (typeof value === "boolean") {
    return null;
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_METADATA_DEPTH) {
      return `${path} exceeds the maximum nesting depth of ${MAX_METADATA_DEPTH}.`;
    }
    if (value.length > MAX_METADATA_ARRAY_LENGTH) {
      return `${path} arrays can contain at most ${MAX_METADATA_ARRAY_LENGTH} items.`;
    }
    for (let index = 0; index < value.length; index += 1) {
      const err = validateMetadataNode(value[index], depth + 1, `${path}[${index}]`);
      if (err) {
        return err;
      }
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return `${path} must contain only JSON-compatible primitive, array, or object values.`;
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return `${path} exceeds the maximum nesting depth of ${MAX_METADATA_DEPTH}.`;
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_METADATA_KEYS_PER_OBJECT) {
    return `${path} objects can contain at most ${MAX_METADATA_KEYS_PER_OBJECT} keys.`;
  }

  for (const [key, nestedValue] of entries) {
    if (!METADATA_KEY_RE.test(key)) {
      return `${path} contains an invalid key "${key}".`;
    }
    const err = validateMetadataNode(nestedValue, depth + 1, `${path}.${key}`);
    if (err) {
      return err;
    }
  }

  return null;
}

function normalizeV2Metadata(metadata) {
  if (metadata == null) {
    return { ok: true, value: null };
  }

  if (!isPlainObject(metadata)) {
    return { ok: false, error: "Metadata must be a JSON object." };
  }

  const validationError = validateMetadataNode(metadata, 0, "metadata");
  if (validationError) {
    return { ok: false, error: validationError };
  }

  let serialized = "";
  try {
    serialized = JSON.stringify(metadata);
  } catch (_err) {
    return { ok: false, error: "Metadata must be JSON-serializable." };
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_METADATA_BYTES) {
    return { ok: false, error: `Metadata must be ${MAX_METADATA_BYTES} bytes or fewer.` };
  }

  return { ok: true, value: JSON.parse(serialized) };
}

module.exports = {
  normalizeV2Metadata,
  MAX_METADATA_BYTES,
  MAX_METADATA_DEPTH,
  MAX_METADATA_KEYS_PER_OBJECT,
  MAX_METADATA_ARRAY_LENGTH,
  MAX_METADATA_STRING_LENGTH
};
