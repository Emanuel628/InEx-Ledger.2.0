(function () {
  const STORAGE_KEY = "lb_privacy_settings";
  const BUSINESS_KEYS = [
    "lb_transactions",
    "lb_receipts",
    "lb_recurring"
  ];
  let apiReady;
  const API_BASE = " ";
  const buildApiUrl = (path) => {
    if (typeof path !== "string") return API_BASE;
    return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  };

  async function apiAvailable() {
    if (typeof apiReady === "boolean") {
      return apiReady;
    }

    try {
      const res = await fetch(buildApiUrl("/api/health"));
      apiReady = res.ok;
      return apiReady;
    } catch (err) {
      apiReady = false;
      return false;
    }
  }

  function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (typeof getToken === "function") {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
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
      const res = await fetch(buildApiUrl("/api/privacy/settings"), {
        headers: authHeaders()
      });
      if (res.ok) {
        return res.json();
      }
    }
    return readLocalSettings();
  }

  async function setPrivacySettings(partial) {
    const base = readLocalSettings();
    const merged = { ...base, ...partial };
    persistLocalSettings(merged);

    if (await apiAvailable()) {
      await fetch(buildApiUrl("/api/privacy/settings"), {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          dataSharingOptOut: !!merged.dataSharingOptOut,
          consentGiven: !!merged.consentGiven,
          consentAt: merged.consentAt,
          termsVersion: merged.termsVersion,
          privacyVersion: merged.privacyVersion
        })
      });
    }

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
    const fileName = `luna-business-my-data-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    if (await apiAvailable()) {
      const res = await fetch(buildApiUrl("/api/privacy/export"), {
        headers: authHeaders()
      });

      if (res.ok) {
        const blob = await res.blob();
        downloadBlob(blob, fileName);
        return;
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
      const res = await fetch(buildApiUrl("/api/privacy/delete"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ scope: "business_data" })
      });
      if (res.ok) {
        return res.json();
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
