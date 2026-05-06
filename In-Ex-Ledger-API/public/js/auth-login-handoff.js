/*
 * Same-tab post-login handoff.
 *
 * auth.js keeps access tokens in memory only. A full redirect from /login or
 * /mfa-challenge to /transactions wipes that memory, forcing page boot to rely
 * on /api/auth/refresh. That is fragile during startup because several API
 * calls can fire at once.
 *
 * This script bridges only the immediate redirect after a real login/MFA:
 * - login/MFA page: when setToken(token) is called, copy token to sessionStorage.
 * - next app page: consume that token once, call setToken(token), then delete it.
 *
 * This is NOT persistent auto-login. The handoff is same-tab only and removed
 * immediately after the protected page starts.
 */
(function () {
  const HANDOFF_KEY = 'lb_post_login_access_token_handoff';
  const HANDOFF_AT_KEY = 'lb_post_login_access_token_handoff_at';
  const MAX_AGE_MS = 60 * 1000;
  const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
  const isAuthPage = path === '/login' || path === '/mfa-challenge';

  function readHandoff() {
    try {
      const token = sessionStorage.getItem(HANDOFF_KEY) || '';
      const createdAt = Number(sessionStorage.getItem(HANDOFF_AT_KEY) || 0);
      const isFresh = createdAt && Date.now() - createdAt <= MAX_AGE_MS;
      if (!token || !isFresh) return '';
      return token;
    } catch (_) {
      return '';
    }
  }

  function clearHandoff() {
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
      sessionStorage.removeItem(HANDOFF_AT_KEY);
    } catch (_) {}
  }

  function writeHandoff(token) {
    try {
      if (!token) return;
      sessionStorage.setItem(HANDOFF_KEY, token);
      sessionStorage.setItem(HANDOFF_AT_KEY, String(Date.now()));
    } catch (_) {}
  }

  function install() {
    if (typeof window.setToken !== 'function') return false;
    if (window.__AUTH_LOGIN_HANDOFF_INSTALLED__) return true;
    window.__AUTH_LOGIN_HANDOFF_INSTALLED__ = true;

    const originalSetToken = window.setToken;
    window.setToken = function setTokenWithLoginHandoff(token) {
      const result = originalSetToken.apply(this, arguments);
      if (isAuthPage && token) {
        writeHandoff(token);
      }
      return result;
    };

    if (!isAuthPage) {
      const token = readHandoff();
      clearHandoff();
      if (token) {
        window.setToken(token);
      }
    }

    return true;
  }

  if (install()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts > 40) {
      window.clearInterval(timer);
    }
  }, 25);
})();
