(function () {
  const STORAGE_KEY = "lb_privacy_settings";
  const BUSINESS_KEYS = [
    "lb_transactions",
    "lb_receipts",
    "lb_recurring"
  ];
  let apiReady;
  const API_BASE = "";
  const buildApiUrl = (path) => {
    if (typeof path !== "string") return API_BASE;
    return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  };

  async function apiAvailable() {
    if (apiReady === true) {
      return apiReady;
    }

    try {
        const res = await fetch(buildApiUrl("/health"));
      apiReady = res.ok;
      return apiReady;
    } catch (err) {
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
    return readLocalSettings();
  }

  async function setPrivacySettings(partial) {
    const base = readLocalSettings();
    const merged = { ...base, ...partial };

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

    persistLocalSettings(merged);
    return merged;
  }

  function readJsonArray(key) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return [];
    }
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

    const payload = {
      privacy: readLocalSettings(),
      transactions: readJsonArray("lb_transactions"),
      receipts: readJsonArray("lb_receipts"),
      recurring: readJsonArray("lb_recurring"),
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

  async function deleteBusinessData() {
    if (await apiAvailable()) {
      try {
        const res = await fetch(buildApiUrl("/api/privacy/delete"), {
          method: "POST",
          headers: authHeaders("POST"),
          credentials: "include",
          body: JSON.stringify({ scope: "business_data" })
        });
        if (res.ok) {
          return res.json();
        }
      } catch (err) {
        // fall through to local deletion
      }
    }

    BUSINESS_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });

    const requestId = newRequestId();
    return { requestId, status: "deleted" };
  }

  window.privacyService = {
    getPrivacySettings,
    setPrivacySettings,
    exportMyData,
    deleteBusinessData,
    apiAvailable
  };
})();
