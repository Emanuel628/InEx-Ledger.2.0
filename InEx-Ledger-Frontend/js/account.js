document.addEventListener("DOMContentLoaded", () => {

  if (typeof requireAuth === "function") {
    requireAuth();
  }

  if (typeof enforceTrial === "function") {
    enforceTrial();
  }

  if (typeof renderTrialBanner === "function") {
    renderTrialBanner("trialBanner");
  }
  populateAccountTypes();
});

function populateAccountTypes() {
  const select = document.getElementById("account-type");
  if (!select) return;

  const types = [
    { value: "checking", label: "Checking" },
    { value: "savings", label: "Savings" },
    { value: "credit", label: "Credit Card" },
    { value: "cash", label: "Cash" },
    { value: "loan", label: "Loan" },
    { value: "other", label: "Other" }
  ];

  // Remove any previously added options (keep the first placeholder)
  select.querySelectorAll("option:not(:first-child)").forEach(opt => opt.remove());

  types.forEach(type => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.label;
    select.appendChild(option);
  });
}
