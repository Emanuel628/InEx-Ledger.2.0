(function () {
  const STORAGE_KEY = "lb_privacy_settings";
  const REQUEST_TIMEOUT_MS = 5000;
  let apiReady = undefined;
  const API_BASE = "";

  const buildApiUrl = (path) => {
    if (typeof path !== "string") return API_BASE;
    return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  };

  async function fetchWithTimeout(url, options = {}) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new Error("Request timed out.")), REQUEST_TIMEOUT_MS)
      : null;

    try {
      return await fetch(url, {
        ...options,
        ...(controller ? { signal: controller.signal } : {})
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function apiAvailable() {
    if (apiReady === true) {
      return true;
    }
    try {
      const res = await fetchWithTimeout(buildApiUrl("/health"));
      if (res.ok) {
        apiReady = true;
        return true;
      }
      apiReady = undefined;
      return false;
    } catch (_) {
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

  function defaultPrivacySettings() {
    return {
      dataSharingOptOut: false,
      consentGiven: false,
      consentAt: null,
      termsVersion: null,
      privacyVersion: null
    };
  }

  function readLocalSettings() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultPrivacySettings();
    }

    try {
      return JSON.parse(raw);
    } catch (_) {
      return defaultPrivacySettings();
    }
  }

  function persistLocalSettings(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  async function getPrivacySettings() {
    try {
      if (await apiAvailable()) {
        try {
          const res = await fetchWithTimeout(buildApiUrl("/api/privacy/settings"), {
            headers: authHeaders()
          });
          if (res.ok) {
            return res.json();
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error("Authentication required to load privacy settings.");
          }
        } catch (_) {
          // Fall through to cached local settings.
        }
      }
    } catch (_) {
      // Fall through to cached local settings.
    }
    return readLocalSettings();
  }

  async function setPrivacySettings(partial) {
    const base = readLocalSettings();
    const merged = { ...base, ...partial };

    if (!(await apiAvailable())) {
      throw new Error("Privacy settings are unavailable while the server is unreachable.");
    }

    const res = await fetchWithTimeout(buildApiUrl("/api/privacy/settings"), {
      method: "POST",
      headers: authHeaders("POST"),
      credentials: "include",
      body: JSON.stringify({
        dataSharingOptOut: !!merged.dataSharingOptOut,
        consentGiven: !!merged.consentGiven,
        consentAt: merged.consentAt,
        termsVersion: merged.termsVersion,
        privacyVersion: merged.privacyVersion,
        marketingEmailOptIn:
          typeof merged.marketingEmailOptIn === "boolean"
            ? merged.marketingEmailOptIn
            : undefined
      })
    }).catch((err) => {
      throw new Error(err?.message || "Privacy settings are unavailable while the server is unreachable.");
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || "Failed to save privacy settings.");
    }

    persistLocalSettings(merged);
    return merged;
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
    const fileName = `inex-ledger-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (await apiAvailable()) {
        try {
          const res = await fetchWithTimeout(buildApiUrl("/api/privacy/export"), {
            method: "POST",
            headers: authHeaders("POST"),
            credentials: "include"
          });
          if (res.ok) {
            const blob = await res.blob();
            downloadBlob(blob, fileName);
            return;
          }
        } catch (_) {
          // Fall through to the unavailable error below.
        }
      }
    } catch (_) {
      // Fall through to the unavailable error below.
    }
    throw new Error("Data export is unavailable while the server is unreachable.");
  }

  async function deleteBusinessData(options = {}) {
    const password = typeof options?.password === "string" ? options.password : "";

    if (!(await apiAvailable())) {
      throw new Error("Business data deletion is unavailable while the server is unreachable.");
    }

    const res = await fetchWithTimeout(buildApiUrl("/api/privacy/delete"), {
      method: "POST",
      headers: authHeaders("POST"),
      credentials: "include",
      body: JSON.stringify({ scope: "business_data", password })
    }).catch((err) => {
      throw new Error(err?.message || "Business data deletion is unavailable while the server is unreachable.");
    });

    if (res.ok) {
      return res.json();
    }

    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || "Failed to delete business data.");
  }

  window.privacyService = {
    getPrivacySettings,
    setPrivacySettings,
    exportMyData,
    deleteBusinessData,
    apiAvailable
  };
})();
