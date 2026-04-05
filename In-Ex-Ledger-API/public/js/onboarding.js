const ONBOARDING_TOURS = {
  transactions: {
    title: "Start here",
    body: "This is your working ledger. Add income and expenses here first, then attach receipts or reconcile later.",
    points: [
      "Use Add transaction to start building your books.",
      "Mark entries cleared once they match your bank or card statement.",
      "Your tax estimate updates as transactions come in."
    ]
  },
  receipts: {
    title: "Capture receipts as you go",
    body: "Upload receipts here first or attach them while entering a transaction. Either path works.",
    points: [
      "Upload a file, then link it to the right transaction.",
      "Keep receipts attached now so exports are cleaner later."
    ]
  },
  mileage: {
    title: "Log business trips quickly",
    body: "Use this for deductible business mileage. Keep each trip specific enough to defend later.",
    points: [
      "Add the date, purpose, destination, and distance.",
      "Mileage uses your current region and unit settings."
    ]
  },
  exports: {
    title: "Exports are your handoff layer",
    body: "When your records are current, generate clean packages here for filing or for your CPA.",
    points: [
      "Use filters before exporting if you only need part of the year.",
      "PDF is best for review, CSV is best for spreadsheet work."
    ]
  }
};

function initOnboardingTours() {
  const path = resolveOnboardingTourPage();
  if (!path || !ONBOARDING_TOURS[path]) {
    return;
  }

  window.addEventListener("lunaProfileReady", (event) => {
    maybeShowOnboardingTour(path, event.detail);
  }, { once: true });

  if (window.__LUNA_ME__) {
    maybeShowOnboardingTour(path, window.__LUNA_ME__);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOnboardingTours);
} else {
  initOnboardingTours();
}

function resolveOnboardingTourPage() {
  const path = String(window.location.pathname || "").replace(/^\/+/, "").replace(/\/+$/, "");
  return path || "transactions";
}

async function maybeShowOnboardingTour(page, profile) {
  const onboarding = profile?.onboarding || {};
  if (!onboarding.completed) {
    return;
  }
  if (onboarding.tour_seen && onboarding.tour_seen[page]) {
    return;
  }
  if (document.getElementById("onboardingTourCard")) {
    return;
  }

  renderOnboardingTour(page);
}

function renderOnboardingTour(page) {
  const config = ONBOARDING_TOURS[page];
  const card = document.createElement("div");
  card.id = "onboardingTourCard";
  card.className = "onboarding-tour-card";
  card.innerHTML = `
    <button type="button" class="onboarding-tour-close" aria-label="Close getting started tip">×</button>
    <div class="onboarding-tour-kicker">Getting started</div>
    <h3>${escapeOnboardingHtml(config.title)}</h3>
    <p>${escapeOnboardingHtml(config.body)}</p>
    <ul>
      ${config.points.map((point) => `<li>${escapeOnboardingHtml(point)}</li>`).join("")}
    </ul>
    <div class="onboarding-tour-actions">
      <button type="button" class="onboarding-tour-dismiss">Got it</button>
    </div>
  `;

  document.body.appendChild(card);
  const dismissTour = async () => {
    card.remove();
    try {
      await apiFetch("/api/me/onboarding/tour", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ page })
      });
    } catch (error) {
      console.error("Failed to update onboarding tour state", error);
    }
  };

  card.querySelector(".onboarding-tour-dismiss")?.addEventListener("click", dismissTour);
  card.querySelector(".onboarding-tour-close")?.addEventListener("click", dismissTour);
}

function escapeOnboardingHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
