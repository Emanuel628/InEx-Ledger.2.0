const crypto = require("crypto");
const { pool } = require("../../db.js");

const defaultAccounts = [
  { name: "Checking", type: "asset" },
  { name: "Cash", type: "asset" },
  { name: "Credit Card", type: "liability" },
];

const defaultCategoriesUS = [
  // Income
  { name: "Sales Revenue", kind: "income", color: "green", tax_map_us: "gross_receipts_sales" },
  { name: "Service Income", kind: "income", color: "green", tax_map_us: "gross_receipts_sales" },
  { name: "Interest Income", kind: "income", color: "green", tax_map_us: "interest_income" },
  { name: "Other Income", kind: "income", color: "slate", tax_map_us: "other_income" },
  // Expenses
  { name: "Advertising & Marketing", kind: "expense", color: "blue", tax_map_us: "advertising" },
  { name: "Bank Fees", kind: "expense", color: "slate", tax_map_us: "bank_fees" },
  { name: "Car & Truck Expenses", kind: "expense", color: "amber", tax_map_us: "car_truck" },
  { name: "Contract Labor", kind: "expense", color: "blue", tax_map_us: "contract_labor" },
  { name: "Home Office", kind: "expense", color: "amber", tax_map_us: "home_office" },
  { name: "Insurance", kind: "expense", color: "blue", tax_map_us: "insurance_other_than_health" },
  { name: "Legal & Professional", kind: "expense", color: "slate", tax_map_us: "legal_professional" },
  { name: "Meals", kind: "expense", color: "amber", tax_map_us: "meals" },
  { name: "Office Supplies", kind: "expense", color: "blue", tax_map_us: "office_expense" },
  { name: "Rent", kind: "expense", color: "blue", tax_map_us: "rent_lease_other" },
  { name: "Repairs & Maintenance", kind: "expense", color: "slate", tax_map_us: "repairs_maintenance" },
  { name: "Sales Tax", kind: "expense", color: "red", tax_map_us: "taxes_licenses" },
  { name: "Software & Subscriptions", kind: "expense", color: "blue", tax_map_us: "software_subscriptions" },
  { name: "Travel", kind: "expense", color: "amber", tax_map_us: "travel" },
  { name: "Utilities", kind: "expense", color: "slate", tax_map_us: "utilities" },
  { name: "Wages & Salaries", kind: "expense", color: "blue", tax_map_us: "wages" },
  { name: "Other Expense", kind: "expense", color: "slate", tax_map_us: "other_expense" },
];

const defaultCategoriesCA = [
  // Income
  { name: "Sales Revenue", kind: "income", color: "green", tax_map_ca: "sales" },
  { name: "Service Income", kind: "income", color: "green", tax_map_ca: "sales" },
  { name: "GST/HST Collected", kind: "income", color: "green", tax_map_ca: "gst_hst_collected" },
  { name: "Grants & Subsidies", kind: "income", color: "green", tax_map_ca: "subsidies_grants" },
  { name: "Other Income", kind: "income", color: "slate", tax_map_ca: "other_income" },
  // Expenses
  { name: "Advertising", kind: "expense", color: "blue", tax_map_ca: "advertising" },
  { name: "Business Tax & Licenses", kind: "expense", color: "red", tax_map_ca: "business_tax_fees_licenses_memberships" },
  { name: "Delivery & Freight", kind: "expense", color: "amber", tax_map_ca: "delivery_freight" },
  { name: "GST/HST Paid", kind: "expense", color: "red", tax_map_ca: "gst_hst_paid" },
  { name: "Home Office", kind: "expense", color: "amber", tax_map_ca: "home_office" },
  { name: "Insurance", kind: "expense", color: "blue", tax_map_ca: "insurance" },
  { name: "Interest & Bank Charges", kind: "expense", color: "slate", tax_map_ca: "interest_bank_charges" },
  { name: "Legal & Accounting Fees", kind: "expense", color: "slate", tax_map_ca: "legal_accounting" },
  { name: "Meals & Entertainment", kind: "expense", color: "amber", tax_map_ca: "meals_entertainment" },
  { name: "Motor Vehicle", kind: "expense", color: "amber", tax_map_ca: "motor_vehicle" },
  { name: "Office Supplies", kind: "expense", color: "blue", tax_map_ca: "office_expense" },
  { name: "Property Taxes", kind: "expense", color: "red", tax_map_ca: "property_taxes" },
  { name: "Rent", kind: "expense", color: "blue", tax_map_ca: "rent" },
  { name: "Repairs & Maintenance", kind: "expense", color: "slate", tax_map_ca: "maintenance_repairs" },
  { name: "Salaries & Wages", kind: "expense", color: "blue", tax_map_ca: "salaries_wages_benefits" },
  { name: "Travel", kind: "expense", color: "amber", tax_map_ca: "travel" },
  { name: "Utilities", kind: "expense", color: "slate", tax_map_ca: "utilities" },
  { name: "Other Expense", kind: "expense", color: "slate", tax_map_ca: "other_expense" },
];

async function seedDefaultsForBusiness(db = pool, businessId) {
  if (!businessId) {
    throw new Error("seedDefaultsForBusiness requires a businessId");
  }

  const targetDb = db ?? pool;

  // Determine the business region so we can seed region-specific categories
  let region = "US";
  try {
    const bizResult = await targetDb.query(
      "SELECT region FROM businesses WHERE id = $1",
      [businessId]
    );
    if (bizResult.rowCount > 0) {
      const r = (bizResult.rows[0].region || "US").toUpperCase();
      if (r === "CA") region = "CA";
    }
  } catch (_) {
    // fall back to US defaults if we can't read the region
  }

  for (const account of defaultAccounts) {
    await targetDb.query(
      `
      INSERT INTO accounts (id, business_id, name, type, created_at)
      VALUES ($1, $2, $3, $4, now())
      `,
      [crypto.randomUUID(), businessId, account.name, account.type]
    );
  }

  const categories = region === "CA" ? defaultCategoriesCA : defaultCategoriesUS;
  for (const category of categories) {
    await targetDb.query(
      `
      INSERT INTO categories (id, business_id, name, kind, color, tax_map_us, tax_map_ca, is_default, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
      `,
      [
        crypto.randomUUID(),
        businessId,
        category.name,
        category.kind,
        category.color || null,
        category.tax_map_us || null,
        category.tax_map_ca || null
      ]
    );
  }
}

module.exports = { seedDefaultsForBusiness };
