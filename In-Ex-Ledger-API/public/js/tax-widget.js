requireAuthAndTier("v1");

function ensureV1TaxWidget() {
  if (effectiveTier() !== "v1") {
    window.location.href = "upgrade";
    return false;
  }

  return true;
}

function wireTaxWidget() {
  const controls = document.querySelectorAll("[data-tax-control]");

  controls.forEach((control) => {
    control.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1TaxWidget()) return;
      console.log("Adjusting tax assumptions...");
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireTaxWidget);
} else {
  wireTaxWidget();
}