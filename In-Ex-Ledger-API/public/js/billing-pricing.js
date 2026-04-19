(function (global) {
  const PRICING_TABLE = {
    usd: {
      monthly: { base: 12, addon: 5, label: "per month", labelKey: "subscription_billing_monthly" },
      yearly: { base: 122.4, addon: 51, label: "per year", labelKey: "subscription_billing_yearly" }
    },
    cad: {
      monthly: { base: 17, addon: 7, label: "per month", labelKey: "subscription_billing_monthly" },
      yearly: { base: 175, addon: 72, label: "per year", labelKey: "subscription_billing_yearly" }
    }
  };

  const BILLING_CURRENCIES = Object.freeze(["usd", "cad"]);
  const BILLING_INTERVALS = Object.freeze(["monthly", "yearly"]);

  function normalizeCurrency(currency) {
    const normalized = String(currency || "usd").toLowerCase();
    return BILLING_CURRENCIES.includes(normalized) ? normalized : "usd";
  }

  function normalizeInterval(interval) {
    const normalized = String(interval || "monthly").toLowerCase();
    return BILLING_INTERVALS.includes(normalized) ? normalized : "monthly";
  }

  function getPricing(currency, interval) {
    return PRICING_TABLE[normalizeCurrency(currency)][normalizeInterval(interval)];
  }

  function formatMoney(currency, amount) {
    const normalizedCurrency = normalizeCurrency(currency);
    return new Intl.NumberFormat(normalizedCurrency === "cad" ? "en-CA" : "en-US", {
      style: "currency",
      currency: normalizedCurrency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function getAddonTotal(currency, interval, additionalBusinesses) {
    const pricing = getPricing(currency, interval);
    const count = Math.max(Number(additionalBusinesses) || 0, 0);
    return pricing.addon * count;
  }

  function getGrandTotal(currency, interval, additionalBusinesses) {
    const pricing = getPricing(currency, interval);
    return pricing.base + getAddonTotal(currency, interval, additionalBusinesses);
  }

  global.billingPricing = {
    BILLING_CURRENCIES,
    BILLING_INTERVALS,
    PRICING_TABLE,
    normalizeCurrency,
    normalizeInterval,
    getPricing,
    formatMoney,
    getAddonTotal,
    getGrandTotal
  };
})(window);
