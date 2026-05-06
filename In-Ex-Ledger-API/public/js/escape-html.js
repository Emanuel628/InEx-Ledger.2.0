/**
 * escape-html.js
 *
 * Shared HTML-escaping utility. Loaded as the first script on every page so
 * auth.js, transactions.js, and other page scripts can call escapeHtml().
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Critical auth startup handoff.
 *
 * auth.js keeps the access token memory-only. A full redirect from login/MFA
 * to /transactions clears that memory. This helper must run BEFORE auth.js and
 * transactions.js. Do not load it as a deferred child script; that can run too
 * late and leave the protected page half-loaded.
 */
(function installImmediateAuthLoginHandoff() {
  const HANDOFF_KEY = "lb_post_login_access_token_handoff";
  const HANDOFF_AT_KEY = "lb_post_login_access_token_handoff_at";
  const MAX_AGE_MS = 60 * 1000;
  const path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
  const isAuthPage = path === "/login" || path === "/mfa-challenge";

  function readFreshHandoffToken() {
    try {
      const token = sessionStorage.getItem(HANDOFF_KEY) || "";
      const createdAt = Number(sessionStorage.getItem(HANDOFF_AT_KEY) || 0);
      if (!token || !createdAt || Date.now() - createdAt > MAX_AGE_MS) {
        return "";
      }
      return token;
    } catch (_) {
      return "";
    }
  }

  function clearHandoffToken() {
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
      sessionStorage.removeItem(HANDOFF_AT_KEY);
    } catch (_) {}
  }

  function writeHandoffToken(token) {
    try {
      if (!token) return;
      sessionStorage.setItem(HANDOFF_KEY, token);
      sessionStorage.setItem(HANDOFF_AT_KEY, String(Date.now()));
    } catch (_) {}
  }

  function installSetTokenWrapper() {
    if (window.__AUTH_LOGIN_HANDOFF_INSTALLED__) return true;
    if (typeof window.setToken !== "function") return false;

    const originalSetToken = window.setToken;
    window.setToken = function setTokenWithImmediateHandoff(token) {
      const result = originalSetToken.apply(this, arguments);
      if (isAuthPage && token) {
        writeHandoffToken(token);
      }
      return result;
    };

    window.__AUTH_LOGIN_HANDOFF_INSTALLED__ = true;
    return true;
  }

  // On protected pages, start trying immediately. auth.js is loaded before the
  // page boot script, so this usually installs and consumes before DOMContentLoaded.
  const pendingToken = !isAuthPage ? readFreshHandoffToken() : "";
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const installed = installSetTokenWrapper();
    if (installed && pendingToken) {
      clearHandoffToken();
      window.setToken(pendingToken);
    } else if (installed && !isAuthPage) {
      clearHandoffToken();
    }
    if (installed || attempts >= 80) {
      window.clearInterval(timer);
    }
  }, 10);
})();

(function wireBusinessQuickAddHardening() {
  if (document.getElementById("hide-business-quick-add-js")) return;

  const script = document.createElement("script");
  script.id = "hide-business-quick-add-js";
  script.src = "/js/hide-business-quick-add.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();

(function wireAnalyticsQuickAddHardening() {
  if (document.getElementById("hide-analytics-quick-add-js")) return;

  const script = document.createElement("script");
  script.id = "hide-analytics-quick-add-js";
  script.src = "/js/hide-analytics-quick-add.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();

(function wireTransactionUndoButton() {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;
  if (document.getElementById("transaction-undo-button-js")) return;

  const script = document.createElement("script");
  script.id = "transaction-undo-button-js";
  script.src = "/js/transaction-undo-button.js?v=20260505b";
  script.defer = true;
  document.head.appendChild(script);
})();

(function wireTransactionCheckboxActions() {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;
  if (document.getElementById("transaction-checkbox-actions-js")) return;

  const script = document.createElement("script");
  script.id = "transaction-checkbox-actions-js";
  script.src = "/js/transaction-checkbox-actions-v2.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();
