(() => {
  const cache = {
    keyPromise: null,
    publicKey: null,
    kid: null
  };
  const EXPECTED_JWK_ALG = "RSA-OAEP-256";
  const EXPECTED_JWK_USE = "enc";

  function resolveApiUrl(path) {
    if (typeof buildApiUrl === "function") {
      return buildApiUrl(path);
    }
    return String(path || "");
  }

  function requireSubtleCrypto() {
    const subtle = window?.crypto?.subtle;
    if (!subtle) {
      throw new Error("Secure browser cryptography is unavailable in this environment.");
    }
    return subtle;
  }

  function validateExportPublicKeyPayload(payload) {
    const jwk = payload?.jwk;
    const kid = String(payload?.kid || "").trim();
    if (!jwk || typeof jwk !== "object" || !kid) {
      throw new Error("Export public key response is missing required fields.");
    }
    if (jwk.alg && jwk.alg !== EXPECTED_JWK_ALG) {
      throw new Error(`Unexpected export public key algorithm: ${jwk.alg}`);
    }
    if (jwk.use && jwk.use !== EXPECTED_JWK_USE) {
      throw new Error(`Unexpected export public key use: ${jwk.use}`);
    }
    return { publicKey: jwk, kid };
  }

  const base64UrlEncode = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  async function fetchExportPublicKey() {
    if (cache.publicKey && cache.kid) {
      return { publicKey: cache.publicKey, kid: cache.kid };
    }
    if (!cache.keyPromise) {
      cache.keyPromise = (async () => {
        const response = await fetch(resolveApiUrl("/api/crypto/export-public-key"), {
          method: "GET",
          credentials: "include"
        });
        if (!response.ok) {
          throw new Error("Failed to load export public key");
        }
        const payload = await response.json();
        const validated = validateExportPublicKeyPayload(payload);
        cache.publicKey = validated.publicKey;
        cache.kid = validated.kid;
        return validated;
      })().catch((err) => {
        cache.keyPromise = null;
        throw err;
      });
    }

    return cache.keyPromise;
  }

  async function encryptTaxId(taxId) {
    const { publicKey, kid } = await fetchExportPublicKey();
    if (!publicKey) {
      throw new Error("Export public key unavailable");
    }

    const subtle = requireSubtleCrypto();
    const importedPublicKey = await subtle.importKey(
      "jwk",
      {
        ...publicKey,
        ext: false
      },
      {
        name: "RSA-OAEP",
        hash: "SHA-256"
      },
      false,
      ["encrypt"]
    );

    const symKey = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const rawSymKey = await subtle.exportKey("raw", symKey);
    const encryptedKeyBuffer = await subtle.encrypt(
      { name: "RSA-OAEP" },
      importedPublicKey,
      rawSymKey
    );

    const header = {
      alg: EXPECTED_JWK_ALG,
      enc: "A256GCM",
      typ: "JWE",
      kid
    };
    const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const aad = new TextEncoder().encode(encodedHeader);

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const taxIdBytes = new TextEncoder().encode(taxId);
    const ciphertextWithTag = await subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
        additionalData: aad
      },
      symKey,
      taxIdBytes
    );

    const ciphertextBytes = new Uint8Array(ciphertextWithTag);
    const tagLength = 16;
    const tagBytes = ciphertextBytes.slice(ciphertextBytes.length - tagLength);
    const ciphertext = ciphertextBytes.slice(0, ciphertextBytes.length - tagLength);

    return [
      encodedHeader,
      base64UrlEncode(encryptedKeyBuffer),
      base64UrlEncode(iv),
      base64UrlEncode(ciphertext),
      base64UrlEncode(tagBytes)
    ].join(".");
  }

  window.exportCrypto = {
    encryptTaxId,
    fetchExportPublicKey
  };
})();
