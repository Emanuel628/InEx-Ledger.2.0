requireAuthAndTier("v1");

function ensureV1TaxWidget() {
  if (effectiveTier() !== "v1") {
    window.location.href = "/upgrade";
    return false;
  }

  return true;
}

function showTaxWidgetUnavailableNotice() {
  const message = typeof t === "function"
    ? t("tax_widget_controls_unavailable")
    : "Tax scenario controls are not available yet.";

  if (typeof showSettingsToast === "function") {
    showSettingsToast(message);
    return;
  }
  if (typeof showAccountMenuNotice === "function") {
    showAccountMenuNotice(message);
  }
}

function wireTaxWidget() {
  const controls = document.querySelectorAll("[data-tax-control]");

  controls.forEach((control) => {
    control.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1TaxWidget()) return;
      showTaxWidgetUnavailableNotice();
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireTaxWidget);
} else {
  wireTaxWidget();
}
