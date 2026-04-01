/* =========================================================
   Account Profile Page JS
   ========================================================= */

requireAuth();

init();

function init() {
  loadProfile();
  wireForm();
}

async function loadProfile() {
  try {
    const response = await apiFetch("/api/me");
    if (!response || !response.ok) return;
    const user = await response.json();
    const fullNameInput = document.querySelector('input[name="full_name"], input[placeholder*="name" i]');
    const displayNameInput = document.querySelector('input[name="display_name"], input[placeholder*="display" i]');
    if (fullNameInput && user.full_name) fullNameInput.value = user.full_name;
    if (displayNameInput && user.display_name) displayNameInput.value = user.display_name;
  } catch (err) {
    console.error("Failed to load profile:", err);
  }
}

function wireForm() {
  const form = document.querySelector("form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveAccountProfile(form);
  });
}

async function saveAccountProfile(form) {
  const inputs = form.querySelectorAll("input[type='text']");
  const full_name = inputs[0]?.value.trim() || null;
  const display_name = inputs[1]?.value.trim() || null;

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await apiFetch("/api/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, display_name })
    });

    if (response && response.ok) {
      alert("Profile saved.");
    } else {
      alert("Failed to save profile.");
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
