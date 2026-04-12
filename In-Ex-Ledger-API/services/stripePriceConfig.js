const STRIPE_PRICE_ENTRIES = [
  { env: "STRIPE_PRICE_V1_MONTHLY_US", billingInterval: "monthly", currency: "usd", type: "base" },
  { env: "STRIPE_PRICE_V1_YEARLY_US", billingInterval: "yearly", currency: "usd", type: "base" },
  { env: "STRIPE_PRICE_V1_MONTHLY_CA", billingInterval: "monthly", currency: "cad", type: "base" },
  { env: "STRIPE_PRICE_V1_YEARLY_CA", billingInterval: "yearly", currency: "cad", type: "base" },
  { env: "STRIPE_PRICE_ADDITIONAL_BUSINESS_MONTHLY_US", billingInterval: "monthly", currency: "usd", type: "addon" },
  { env: "STRIPE_PRICE_ADDITIONAL_BUSINESS_YEARLY_US", billingInterval: "yearly", currency: "usd", type: "addon" },
  { env: "STRIPE_PRICE_ADDITIONAL_BUSINESS_MONTHLY_CA", billingInterval: "monthly", currency: "cad", type: "addon" },
  { env: "STRIPE_PRICE_ADDITIONAL_BUSINESS_YEARLY_CA", billingInterval: "yearly", currency: "cad", type: "addon" }
];

function buildStripePriceLookup() {
  const basePriceIds = new Set();
  const addonPriceIds = new Set();
  const metadataByPriceId = new Map();

  STRIPE_PRICE_ENTRIES.forEach((entry) => {
    const priceId = process.env[entry.env];
    if (!priceId) {
      return;
    }
    if (entry.type === "addon") {
      addonPriceIds.add(priceId);
    } else {
      basePriceIds.add(priceId);
    }
    metadataByPriceId.set(priceId, {
      billingInterval: entry.billingInterval,
      currency: entry.currency,
      type: entry.type
    });
  });

  return { basePriceIds, addonPriceIds, metadataByPriceId };
}

function buildStripePriceEnvMap() {
  const base = {
    monthly: { usd: null, cad: null },
    yearly: { usd: null, cad: null }
  };
  const addon = {
    monthly: { usd: null, cad: null },
    yearly: { usd: null, cad: null }
  };

  STRIPE_PRICE_ENTRIES.forEach((entry) => {
    if (entry.type === "addon") {
      addon[entry.billingInterval][entry.currency] = entry.env;
    } else {
      base[entry.billingInterval][entry.currency] = entry.env;
    }
  });

  return { base, addon };
}

module.exports = {
  STRIPE_PRICE_ENTRIES,
  buildStripePriceLookup,
  buildStripePriceEnvMap
};
