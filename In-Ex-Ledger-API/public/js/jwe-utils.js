(() => {
  const cache = {
    keyPromise: null,
    publicKey: null,
    kid: null
  };

  const base64UrlEncode = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const base64UrlDecode = (value) => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (padded.length % 4)) % 4);
    const decoded = atob(padded + padding);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes.buffer;
  };

  async function fetchExportPublicKey() {
    if (cache.publicKey && cache.kid) {
      return { publicKey: cache.publicKey, kid: cache.kid };
    }
    if (cache.keyPromise) {
      return cache.keyPromise;
    }

    cache.keyPromise = fetch(buildApiUrl("/api/crypto/export-public-key"), {
      method: "GET",
      credentials: "include"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load export public key");
        }
        const payload = await response.json();
        cache.publicKey = payload.jwk;
        cache.kid = payload.kid;
        return { publicKey: cache.publicKey, kid: cache.kid };
      })
      .finally(() => {
        cache.keyPromise = null;
      });

    return cache.keyPromise;
  }

  async function encryptTaxId(taxId) {
    const { publicKey, kid } = await fetchExportPublicKey();
    if (!publicKey) {
      throw new Error("Export public key unavailable");
    }

    const subtle = window.crypto.subtle;
    const importedPublicKey = await subtle.importKey(
      "jwk",
      {
        ...publicKey,
        ext: false,
        alg: "RSA-OAEP-256",
        use: "enc"
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

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const taxIdBytes = encoder.encode(taxId);
    const ciphertextWithTag = await subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128
      },
      symKey,
      taxIdBytes
    );

    const ciphertextBytes = new Uint8Array(ciphertextWithTag);
    const tagLength = 16;
    const tagBytes = ciphertextBytes.slice(ciphertextBytes.length - tagLength);
    const ciphertext = ciphertextBytes.slice(0, ciphertextBytes.length - tagLength);

    const header = {
      alg: "RSA-OAEP-256",
      enc: "A256GCM",
      typ: "JWE",
      kid
    };

    const segments = [
      base64UrlEncode(new TextEncoder().encode(JSON.stringify(header))),
      base64UrlEncode(encryptedKeyBuffer),
      base64UrlEncode(iv),
      base64UrlEncode(ciphertext),
      base64UrlEncode(tagBytes)
    ];

    return segments.join(".");
  }

  window.exportCrypto = {
    encryptTaxId,
    fetchExportPublicKey
  };
})();
