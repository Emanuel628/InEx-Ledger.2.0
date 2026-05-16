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
  accounts: {
    title: "Set up the accounts you actually use",
    body: "Add the bank, card, cash, and loan accounts you use to move money. Your transactions should post into these.",
    points: [
      "Start with your main checking account first.",
      "Keep account names recognizable so reconciliation is easier later.",
      "You can add more accounts any time your setup grows."
    ]
  },
  categories: {
    title: "Categories drive clean books",
    body: "Use categories to sort income and expenses so your reports and tax exports stay accurate.",
    points: [
      "Keep categories practical instead of overly detailed.",
      "Map categories carefully if you want cleaner Schedule C or T2125 exports.",
      "You can refine your category list as real transactions come in."
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

const GUIDED_SETUP_ORDER = ["categories", "accounts", "transactions"];
const GUIDED_SETUP_CONFIG = {
  categories: {
    stepNumber: 1,
    titleKey: "onboarding_guide_categories_title",
    bodyKey: "onboarding_guide_categories_body",
    helperKey: "onboarding_guide_categories_helper",
    points: [
      "onboarding_guide_categories_point_1",
      "onboarding_guide_categories_point_2"
    ],
    launchSelector: "#addExpenseCategoryBtn, #addIncomeCategoryBtn",
    launchLabelKey: "onboarding_guide_categories_add",
    nextAction: "next",
    nextLabelKey: "onboarding_guide_next"
  },
  accounts: {
    stepNumber: 2,
    titleKey: "onboarding_guide_accounts_title",
    bodyKey: "onboarding_guide_accounts_body",
    helperKey: "onboarding_guide_accounts_helper",
    points: [
      "onboarding_guide_accounts_point_1",
      "onboarding_guide_accounts_point_2"
    ],
    launchSelector: "#showAccountForm",
    launchLabelKey: "onboarding_guide_accounts_add",
    nextAction: "next",
    nextLabelKey: "onboarding_guide_next"
  },
  transactions: {
    stepNumber: 3,
    titleKey: "onboarding_guide_transactions_title",
    bodyKey: "onboarding_guide_transactions_body",
    helperKey: "onboarding_guide_transactions_helper",
    points: [
      "onboarding_guide_transactions_point_1",
      "onboarding_guide_transactions_point_2"
    ],
    launchSelector: "#addTxTogglePage, #addTxToggle",
    launchLabelKey: "onboarding_guide_transactions_add",
    nextAction: "finish",
    nextLabelKey: "onboarding_guide_finish"
  }
};

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function getGuidedCardUiStateKey(page) {
  return `inex:onboarding-guide-ui:${page}`;
}

function readGuidedCardUiState(page) {
  try {
    const raw = window.sessionStorage?.getItem(getGuidedCardUiStateKey(page));
    if (!raw) {
      return { minimized: false, closed: false };
    }
    const parsed = JSON.parse(raw);
    return {
      minimized: !!parsed?.minimized,
      closed: !!parsed?.closed
    };
  } catch (_) {
    return { minimized: false, closed: false };
  }
}

function writeGuidedCardUiState(page, state = {}) {
  try {
    window.sessionStorage?.setItem(
      getGuidedCardUiStateKey(page),
      JSON.stringify({
        minimized: !!state.minimized,
        closed: !!state.closed
      })
    );
  } catch (_) {
    // Ignore session storage failures for optional UI state.
  }
}

function clearGuidedCardUiState(page) {
  try {
    window.sessionStorage?.removeItem(getGuidedCardUiStateKey(page));
  } catch (_) {
    // Ignore session storage failures for optional UI state.
  }
}

function initOnboardingTours() {
  const page = resolveOnboardingTourPage();
  if (!page) {
    return;
  }

  if (window.__LUNA_ME__) {
    maybeShowOnboardingTour(page, window.__LUNA_ME__);
    return;
  }

  window.addEventListener("lunaProfileReady", (event) => {
    maybeShowOnboardingTour(page, event.detail);
  }, { once: true });
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

function getOnboardingData() {
  return window.__LUNA_ME__?.onboarding?.data || window.__LUNA_ONBOARDING__?.data || {};
}

function getWorkTypeTourNote(page) {
  const onboardingData = getOnboardingData();
  const startFocus = String(onboardingData.start_focus || "").trim().toLowerCase();
  const region = String(onboardingData.region || "").trim().toUpperCase();
  const regionLabel = region === "CA" ? "Canadian" : "US";

  if (startFocus === "exports" && page === "exports") {
    return `${regionLabel} filing defaults are already set from onboarding. Review your categories and receipts before generating a handoff export.`;
  }

  if (startFocus === "receipts" && page === "receipts") {
    return "Since receipts were your starting focus, attach one real receipt here before you build more of the ledger.";
  }

  if (startFocus === "mileage" && page === "mileage") {
    return "Mileage was part of your setup focus, so log one real business trip here while the details are still fresh.";
  }

  const setupNotes = Array.isArray(onboardingData.setup_notes) ? onboardingData.setup_notes : [];
  const firstNote = setupNotes.find((note) => typeof note === "string" && note.trim());
  return firstNote ? String(firstNote).trim() : "";
}

function maybeShowOnboardingTour(page, profile) {
  const onboarding = profile?.onboarding || {};
  if (!onboarding.completed || document.getElementById("onboardingTourCard")) {
    return;
  }

  const onboardingData = onboarding.data || {};
  const guidedStep = String(onboardingData.guided_setup_step || "").trim().toLowerCase();
  if (onboardingData.guided_setup_active) {
    if (guidedStep === page && GUIDED_SETUP_CONFIG[page]) {
      renderGuidedSetupCard(page);
    }
    return;
  }

  if (onboarding.tour_seen && onboarding.tour_seen[page]) {
    return;
  }
  if (!ONBOARDING_TOURS[page]) {
    return;
  }

  renderOnboardingTour(page);
}

function renderGuidedSetupCard(page) {
  const config = GUIDED_SETUP_CONFIG[page];
  if (!config) {
    return;
  }
  const uiState = readGuidedCardUiState(page);
  if (uiState.closed) {
    return;
  }

  const card = document.createElement("div");
  card.id = "onboardingTourCard";
  card.className = "onboarding-tour-card onboarding-tour-card-guided";
  if (uiState.minimized) {
    card.classList.add("is-minimized");
  }
  const stepLabel = `${tx("onboarding_guide_step_prefix")} ${config.stepNumber} ${tx("onboarding_guide_step_of")} ${GUIDED_SETUP_ORDER.length}`;
  const canGoBack = config.stepNumber > 1;
  const launchButton = document.querySelector(config.launchSelector)
    ? `<button type="button" class="onboarding-tour-secondary onboarding-guide-launch">${escapeHtml(tx(config.launchLabelKey))}</button>`
    : "";

  card.innerHTML = `
    <div class="onboarding-tour-header">
      <div>
        <div class="onboarding-tour-kicker">${escapeHtml(tx("onboarding_guide_kicker"))}</div>
        <div class="onboarding-tour-step">${escapeHtml(stepLabel)}</div>
      </div>
      <div class="onboarding-tour-controls">
        <button type="button" class="onboarding-tour-control onboarding-tour-minimize" aria-label="Minimize setup card" title="Minimize">−</button>
        <button type="button" class="onboarding-tour-control onboarding-tour-close" aria-label="Close setup card" title="Close">&times;</button>
      </div>
    </div>
    <h3>${escapeHtml(tx(config.titleKey))}</h3>
    <div class="onboarding-tour-body">
      <p>${escapeHtml(tx(config.bodyKey))}</p>
      <ul>
        ${config.points.map((point) => `<li>${escapeHtml(tx(point))}</li>`).join("")}
      </ul>
      <p class="onboarding-tour-helper">${escapeHtml(tx(config.helperKey))}</p>
      <div class="onboarding-tour-actions">
        ${launchButton}
        ${canGoBack ? `<button type="button" class="onboarding-tour-ghost onboarding-guide-back">${escapeHtml(tx("onboarding_guide_back"))}</button>` : ""}
        <button type="button" class="onboarding-tour-dismiss onboarding-guide-next">${escapeHtml(tx(config.nextLabelKey))}</button>
        <button type="button" class="onboarding-tour-ghost onboarding-guide-skip">${escapeHtml(tx("onboarding_guide_skip"))}</button>
      </div>
    </div>
  `;

  document.body.appendChild(card);

  const minimizeButton = card.querySelector(".onboarding-tour-minimize");
  const closeButton = card.querySelector(".onboarding-tour-close");

  const syncMinimizedState = (minimized) => {
    card.classList.toggle("is-minimized", minimized);
    if (minimizeButton) {
      minimizeButton.textContent = minimized ? "+" : "−";
      minimizeButton.setAttribute("aria-label", minimized ? "Expand setup card" : "Minimize setup card");
      minimizeButton.setAttribute("title", minimized ? "Expand" : "Minimize");
    }
    writeGuidedCardUiState(page, { minimized, closed: false });
  };

  card.querySelector(".onboarding-guide-launch")?.addEventListener("click", () => {
    document.querySelector(config.launchSelector)?.click();
  });
  minimizeButton?.addEventListener("click", () => {
    syncMinimizedState(!card.classList.contains("is-minimized"));
  });
  closeButton?.addEventListener("click", () => {
    writeGuidedCardUiState(page, { minimized: false, closed: true });
    card.remove();
  });
  card.querySelector(".onboarding-guide-back")?.addEventListener("click", () => {
    advanceGuidedSetup("back", page, card);
  });
  card.querySelector(".onboarding-guide-next")?.addEventListener("click", () => {
    advanceGuidedSetup(config.nextAction, page, card);
  });
  card.querySelector(".onboarding-guide-skip")?.addEventListener("click", () => {
    advanceGuidedSetup("skip", page, card);
  });

  syncMinimizedState(uiState.minimized);
}

async function advanceGuidedSetup(action, page, card) {
  const buttons = Array.from(card.querySelectorAll("button"));
  buttons.forEach((button) => button.setAttribute("disabled", "true"));

  try {
    const response = await apiFetch("/api/me/onboarding/guide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, page })
    });
    const result = response ? await response.json().catch(() => null) : null;

    if (!response || !response.ok) {
      throw new Error(result?.error || "Unable to continue guided onboarding.");
    }

    if (window.__LUNA_ME__ && typeof window.__LUNA_ME__ === "object") {
      window.__LUNA_ME__.onboarding = result?.onboarding || window.__LUNA_ME__.onboarding || null;
    }
    window.__LUNA_ONBOARDING__ = result?.onboarding || window.__LUNA_ONBOARDING__ || null;
    clearGuidedCardUiState(page);
    window.location.href = result?.redirect_to || "/transactions";
  } catch (error) {
    console.error("Failed to update guided onboarding state", error);
    buttons.forEach((button) => button.removeAttribute("disabled"));
  }
}

function renderOnboardingTour(page) {
  const config = ONBOARDING_TOURS[page];
  const personalizedNote = getWorkTypeTourNote(page);
  const card = document.createElement("div");
  card.id = "onboardingTourCard";
  card.className = "onboarding-tour-card";
  card.innerHTML = `
    <button type="button" class="onboarding-tour-close" aria-label="Close getting started tip">&times;</button>
    <div class="onboarding-tour-kicker">Getting started</div>
    <h3>${escapeHtml(config.title)}</h3>
    <p>${escapeHtml(config.body)}</p>
    <ul>
      ${config.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
    ${personalizedNote ? `<p class="onboarding-tour-helper">${escapeHtml(personalizedNote)}</p>` : ""}
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
