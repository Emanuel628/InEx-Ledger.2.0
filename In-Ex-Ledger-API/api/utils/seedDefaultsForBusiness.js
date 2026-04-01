import crypto from "node:crypto";
import pool from "../../db.js";

const defaultAccounts = [
  { name: "Checking", type: "asset" },
  { name: "Cash", type: "asset" },
  { name: "Credit Card", type: "liability" },
];

const defaultCategories = [
  { name: "Income", kind: "income" },
  { name: "Advertising", kind: "expense" },
  { name: "Office Supplies", kind: "expense" },
  { name: "Software", kind: "expense" },
  { name: "Meals", kind: "expense" },
  { name: "Travel", kind: "expense" },
];

export async function seedDefaultsForBusiness(db = pool, businessId) {
  if (!businessId) {
    throw new Error("seedDefaultsForBusiness requires a businessId");
  }

  const targetDb = db ?? pool;

  for (const account of defaultAccounts) {
    await targetDb.query(
      `
      INSERT INTO accounts (id, business_id, name, type, created_at)
      VALUES ($1, $2, $3, $4, now())
      `,
      [crypto.randomUUID(), businessId, account.name, account.type]
    );
  }

  for (const category of defaultCategories) {
    await targetDb.query(
      `
      INSERT INTO categories (id, business_id, name, kind, created_at)
      VALUES ($1, $2, $3, $4, now())
      `,
      [crypto.randomUUID(), businessId, category.name, category.kind]
    );
  }
}
