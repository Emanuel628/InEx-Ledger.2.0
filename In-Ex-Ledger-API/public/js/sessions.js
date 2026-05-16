/* Sessions page — lists active sessions and allows revocation */

const SESSIONS_TOAST_MS = 3000;

let sessionsToastTimer = null;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function formatSessionDate(isoString) {
  if (!isoString) return "-";
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return isoString;
  }
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

function showSessionsToast(message) {
  const toast = document.getElementById("sessionsToast");
  const messageNode = document.getElementById("sessionsToastMessage");
  if (!toast || !messageNode) return;

  messageNode.textContent = message;
  toast.classList.remove("hidden");

  if (sessionsToastTimer) clearTimeout(sessionsToastTimer);
  sessionsToastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, SESSIONS_TOAST_MS);
}

function setSessionsMessage(text, isError = false) {
  const el = document.getElementById("sessionsMessage");
  if (!el) return;
  el.textContent = text;
  el.className = "sessions-message" + (text ? (isError ? " is-error" : " is-info") : "");
}

async function loadSessions() {
  const list = document.getElementById("sessionsList");
  if (!list) return;

  list.innerHTML = `<div class="sessions-loading" aria-live="polite">${escapeHtml(tx("common_loading") || "Loading...")}</div>`;
  setSessionsMessage("");

  try {
    const res = await apiFetch("/api/sessions");
    if (!res) throw new Error(tx("sessions_error_unreachable") || "Could not reach server.");
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || tx("sessions_error_load") || "Failed to load sessions.");
    }

    const payload = await res.json();
    renderSessionsList(payload?.sessions);
  } catch (err) {
    list.innerHTML = "";
    setSessionsMessage(err.message || tx("sessions_error_load") || "Failed to load sessions.", true);
  }
}

function renderSessionsList(sessions) {
  const list = document.getElementById("sessionsList");
  if (!list) return;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    list.innerHTML = `<div class="sessions-empty">${escapeHtml(tx("sessions_empty") || "No active sessions found.")}</div>`;
    return;
  }

  list.innerHTML = sessions.map((session) => {
    const expiringSoon = isExpiringSoon(session.expires_at);
    const sessionMeta = [
      session.device_label ? `<span class="session-card-label">${escapeHtml(session.device_label)}</span>` : "",
      session.ip_address ? `<span class="session-card-date">${escapeHtml(session.ip_address)}</span>` : "",
      session.mfa_authenticated
        ? `<span class="session-expiring-badge">${escapeHtml(tx("sessions_mfa_authenticated") || "MFA verified")}</span>`
        : "",
      session.is_current
        ? `<span class="session-expiring-badge">${escapeHtml(tx("sessions_current_badge") || "Current session")}</span>`
        : ""
    ].filter(Boolean).join(" ");
    return `
      <article class="session-card" data-session-id="${escapeHtml(session.id)}">
        <div class="session-card-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <rect x="2" y="5" width="12" height="9" rx="1.5"></rect>
            <path d="M5 5V4a3 3 0 0 1 6 0v1"></path>
          </svg>
        </div>
        <div class="session-card-body">
          <div class="session-card-meta">
            <span class="session-card-label" data-i18n="sessions_signed_in">Signed in</span>
            <span class="session-card-date">${escapeHtml(formatSessionDate(session.created_at))}</span>
          </div>
          <div class="session-card-meta">
            <span class="session-card-label">${escapeHtml(tx("sessions_last_active") || "Last active")}</span>
            <span class="session-card-date">${escapeHtml(formatSessionDate(session.last_active_at))}</span>
          </div>
          <div class="session-card-meta">${sessionMeta}</div>
          <div class="session-card-meta">
            <span class="session-card-label" data-i18n="sessions_expires">Expires</span>
            <span class="session-card-date${expiringSoon ? " session-expiring-soon" : ""}">
              ${escapeHtml(formatSessionDate(session.expires_at))}
              ${expiringSoon ? `<span class="session-expiring-badge" data-i18n="sessions_expiring_soon">Expiring soon</span>` : ""}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="session-revoke-btn"
          data-session-revoke="${escapeHtml(session.id)}"
          data-session-current="${session.is_current ? "true" : "false"}"
          aria-label="${escapeHtml(tx("sessions_revoke_label") || "Revoke session")}"
        >${escapeHtml(tx("sessions_revoke") || "Revoke")}</button>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-session-revoke]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sessionId = btn.getAttribute("data-session-revoke");
      const isCurrentSession = btn.getAttribute("data-session-current") === "true";
      if (!sessionId) return;
      if (isCurrentSession && !window.confirm(tx("sessions_confirm_revoke_current") || "Revoking this session will sign you out on this device. Continue?")) {
        return;
      }
      btn.disabled = true;
      await revokeSession(sessionId, { isCurrentSession });
      btn.disabled = false;
    });
  });
}

async function revokeSession(sessionId, { isCurrentSession = false } = {}) {
  setSessionsMessage("");

  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    });

    if (!res) throw new Error(tx("sessions_error_revoke") || "Failed to revoke session.");
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || tx("sessions_error_revoke") || "Failed to revoke session.");
    }

    const payload = await res.json().catch(() => ({}));
    showSessionsToast(tx("sessions_revoked") || "Session revoked.");
    if (payload?.current_session_revoked || isCurrentSession) {
      window.setTimeout(() => {
        if (typeof markLoginReset === "function") {
          markLoginReset();
        }
        if (typeof clearToken === "function") {
          clearToken();
        }
        window.location.href = "/login";
      }, 900);
      return;
    }
    await loadSessions();
  } catch (err) {
    setSessionsMessage(err.message || tx("sessions_error_revoke") || "Failed to revoke session.", true);
  }
}

async function revokeAllSessions() {
  if (!window.confirm(tx("sessions_confirm_revoke_all") || "Sign out of all sessions? You will be redirected to the login page.")) {
    return;
  }

  setSessionsMessage("");

  try {
    const res = await apiFetch("/api/sessions", {
      method: "DELETE"
    });

    if (!res) throw new Error(tx("sessions_error_revoke_all") || "Failed to revoke all sessions.");
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || tx("sessions_error_revoke_all") || "Failed to revoke all sessions.");
    }

    await res.json().catch(() => ({}));
    showSessionsToast(tx("sessions_all_revoked") || "All sessions revoked. Signing out...");
    window.setTimeout(() => {
      if (typeof markLoginReset === "function") {
        markLoginReset();
      }
      if (typeof clearToken === "function") {
        clearToken();
      }
      window.location.href = "/login";
    }, 1200);
  } catch (err) {
    setSessionsMessage(err.message || tx("sessions_error_revoke_all") || "Failed to revoke all sessions.", true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  await loadSessions();

  const revokeAllBtn = document.getElementById("revokeAllBtn");
  revokeAllBtn?.addEventListener("click", revokeAllSessions);
});
