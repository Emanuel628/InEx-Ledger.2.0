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
 * Temporary auth compatibility bridge.
 *
 * auth.js was changed to memory-only access tokens. That broke the existing
 * redirect flow because /login writes the token, then /transactions loads in a
 * new page context. Until auth.js is fully reverted, this restores the previous
 * sessionStorage token contract early enough that the app can load normally.
 */
(function restoreSessionTokenAuthContract() {
  const TOKEN_KEY = "token";
  const MAX_ATTEMPTS = 120;

  let originalRemoveItem = null;
  let storageGuardActive = true;

  try {
    originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function guardedRemoveItem(key) {
      if (storageGuardActive && this === window.sessionStorage && key === TOKEN_KEY) {
        return undefined;
      }
      return originalRemoveItem.apply(this, arguments);
    };
  } catch (_) {
    originalRemoveItem = null;
  }

  function readStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function writeStoredToken(token) {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (_) {}
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  function restoreRemoveItem() {
    storageGuardActive = false;
    if (originalRemoveItem) {
      try {
        Storage.prototype.removeItem = originalRemoveItem;
      } catch (_) {}
    }
  }

  function installContract() {
    if (window.__AUTH_SESSION_TOKEN_CONTRACT_RESTORED__) {
      restoreRemoveItem();
      return true;
    }

    if (typeof window.getToken !== "function" || typeof window.setToken !== "function") {
      return false;
    }

    window.getToken = function getTokenFromSessionStorage() {
      return readStoredToken();
    };

    window.setToken = function setTokenInSessionStorage(token) {
      writeStoredToken(token);
    };

    window.clearToken = function clearSessionStorageToken() {
      writeStoredToken("");
      if (typeof window.clearSubscriptionState === "function") {
        window.clearSubscriptionState();
      }
      if (typeof window.clearAppState === "function") {
        window.clearAppState();
      }
      if (window.__AUTH_GUARD_STATE__) {
        window.__AUTH_GUARD_STATE__.lastError = null;
      }
    };

    window.__AUTH_SESSION_TOKEN_CONTRACT_RESTORED__ = true;
    restoreRemoveItem();
    return true;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installContract() || attempts >= MAX_ATTEMPTS) {
      window.clearInterval(timer);
      restoreRemoveItem();
    }
  }, 1);

  window.addEventListener("DOMContentLoaded", () => {
    installContract();
    restoreRemoveItem();
  }, { once: true });
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
