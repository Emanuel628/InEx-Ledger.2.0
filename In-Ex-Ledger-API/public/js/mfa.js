/* =========================================================
   Sessions Page JS
   ========================================================= */

// Sessions is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Sessions page loaded.");

  wireActions();
}

/* -------------------------
   Actions (preliminary)
   ------------------------- */

function wireActions() {
  // Sign out of all sessions
  const signOutAllBtn = document.querySelector('[data-action="signout-all"]');

  if (signOutAllBtn) {
    signOutAllBtn.addEventListener("click", (e) => {
      e.preventDefault();
      signOutAllSessions();
    });
  }
}

/* -------------------------
   Behavior (preliminary)
   ------------------------- */

function signOutAllSessions() {
  // Future: apiFetch("/security/sessions/revoke", { method: "POST" })
  console.log("Signing out of all sessions (preliminary).");

  alert("All other sessions have been signed out.");

  // Optional: also log out current session
  // signOut();
}

/* =========================================================
   MFA Page JS
   ========================================================= */

// MFA is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("MFA page loaded.");

  wireActions();
}

/* -------------------------
   Actions (preliminary)
   ------------------------- */

function wireActions() {
  const enableBtn = document.querySelector('[data-action="enable-mfa"]');
  const disableBtn = document.querySelector('[data-action="disable-mfa"]');

  if (enableBtn) {
    enableBtn.addEventListener("click", (e) => {
      e.preventDefault();
      enableMfa();
    });
  }

  if (disableBtn) {
    disableBtn.addEventListener("click", (e) => {
      e.preventDefault();
      disableMfa();
    });
  }
}

/* -------------------------
   Behavior (preliminary)
   ------------------------- */

function enableMfa() {
  // Future: apiFetch("/security/mfa/enable", { method: "POST" })
  console.log("Enabling MFA (preliminary).");
  alert("Multi-factor authentication enabled.");
}

function disableMfa() {
  // Future: apiFetch("/security/mfa/disable", { method: "POST" })
  console.log("Disabling MFA (preliminary).");
  alert("Multi-factor authentication disabled.");
}