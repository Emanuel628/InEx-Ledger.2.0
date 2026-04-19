(function () {
  const STORAGE_KEY = "lb_privacy_settings";
  const BUSINESS_KEYS = [
    "ledger_transactions",
    "ledger_receipts",
    "ledger_recurring"
  ];
  let apiReady = undefined;
  const API_BASE = "";
  const buildApiUrl = (path) => {
    if (typeof path !== "string") return API_BASE;
    return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  };

  async function apiAvailable() {
    // Always retry if last check failed, only cache success
    if (apiReady === true) {
      return true;
    }
    try {
      const res = await fetch(buildApiUrl("/health"));
      if (res.ok) {
        apiReady = true;
        return true;
      } else {
        apiReady = undefined;
        return false;
      }
    } catch (err) {
      apiReady = undefined;
      return false;
    }
  }

  function authHeaders(method = "GET") {
    const headers = { "Content-Type": "application/json" };
    if (typeof getToken === "function") {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    if (typeof csrfHeader === "function") {
      Object.assign(headers, csrfHeader(method));
    }
    return headers;
  }

  function readLocalSettings() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        dataSharingOptOut: false,
        consentGiven: false,
        consentAt: null,
        termsVersion: null,
        privacyVersion: null
      };
    }

    try {
      return JSON.parse(raw);
    } catch (err) {
      return {
        dataSharingOptOut: false,
        consentGiven: false,
        consentAt: null,
        termsVersion: null,
        privacyVersion: null
      };
    }
  }

  function persistLocalSettings(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  async function getPrivacySettings() {
    try {
      if (await apiAvailable()) {
        try {
          const res = await fetch(buildApiUrl("/api/privacy/settings"), {
            headers: authHeaders()
          });
          if (res.ok) {
            return res.json();
          }
        } catch (err) {
          // fall through to local settings
        }
      }
    } catch (err) {
      // Defensive: should never throw
    }
    return readLocalSettings();
  }

  async function setPrivacySettings(partial) {
    const base = readLocalSettings();
    const merged = { ...base, ...partial };
    try {
      if (await apiAvailable()) {
        try {
          const res = await fetch(buildApiUrl("/api/privacy/settings"), {
            method: "PUT",
            headers: authHeaders("PUT"),
            credentials: "include",
            body: JSON.stringify({
              dataSharingOptOut: !!merged.dataSharingOptOut,
              consentGiven: !!merged.consentGiven,
              consentAt: merged.consentAt,
              termsVersion: merged.termsVersion,
              privacyVersion: merged.privacyVersion
            })
          });
          if (!res.ok) {
            // Server rejected the change — do not update local state.
            return base;
          }
        } catch (err) {
          // Network failure is non-fatal; fall through to persist locally.
        }
      }
    } catch (err) {
      // Defensive: should never throw
    }
    persistLocalSettings(merged);
    return merged;
  }

  function readJsonArray(key) {
    const storageKey = resolveBusinessStorageKey(key);
    if (!storageKey) {
      return [];
    }
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return [];
    }
  }

  function resolveBusinessStorageKey(key) {
    if (!key) {
      return null;
    }
    if (window.lunaStorage?.getKey) {
      return window.lunaStorage.getKey(key);
    }
    const userId = window.__LUNA_ME__?.id || window.__LUNA_ME__?.user_id || window.__LUNA_ME__?.userId || "";
    const businessId = window.__LUNA_ME__?.active_business_id || localStorage.getItem("lb_active_business_id") || "";
    if (!userId || !businessId) {
      return null;
    }
    return `lb:${userId}:${businessId}:${key}`;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function exportMyData() {
    const fileName = `inex-ledger-my-data-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    try {
      if (await apiAvailable()) {
        try {
          const res = await fetch(buildApiUrl("/api/privacy/export"), {
            method: "POST",
            headers: authHeaders("POST"),
            credentials: "include"
          });
          if (res.ok) {
            const blob = await res.blob();
            downloadBlob(blob, fileName);
            return;
          }
        } catch (err) {
          // fall through to local export
        }
      }
    } catch (err) {
      // Defensive: should never throw
    }
    const payload = {
      privacy: readLocalSettings(),
      transactions: readJsonArray("ledger_transactions"),
      receipts: readJsonArray("ledger_receipts"),
      recurring: readJsonArray("ledger_recurring"),
      meta: {
        exportedAt: new Date().toISOString(),
        app: "InEx Ledger"
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, fileName);
  }

  function newRequestId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `local-${Date.now()}`;
  }

  async function deleteBusinessData(options = {}) {
    const password = typeof options?.password === "string" ? options.password : "";
    try {
      if (await apiAvailable()) {
        try {
          const res = await fetch(buildApiUrl("/api/privacy/delete"), {
            method: "POST",
            headers: authHeaders("POST"),
            credentials: "include",
            body: JSON.stringify({ scope: "business_data", password })
          });
          if (res.ok) {
            return res.json();
          }
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Failed to delete business data.");
        } catch (err) {
          // fall through to local delete
        }
      }
    } catch (err) {
      // Defensive: should never throw
    }
    try {
      BUSINESS_KEYS.forEach((key) => {
        const storageKey = resolveBusinessStorageKey(key);
        if (storageKey) {
          localStorage.removeItem(storageKey);
        }
      });
      const requestId = newRequestId();
      return { requestId, status: "deleted" };
    } catch (err) {
      throw new Error("Failed to delete local business data.");
    }
  }

  window.privacyService = {
    getPrivacySettings,
    setPrivacySettings,
    exportMyData,
    deleteBusinessData,
    apiAvailable
  };
})();
