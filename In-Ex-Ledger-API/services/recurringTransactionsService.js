const crypto = require("crypto");
const { pool } = require("../db.js");
const { loadAccountingLockState, isDateLocked } = require("./accountingLockService.js");
const { assertCanCreateTransactions } = require("./basicPlanUsageService.js");

const VALID_CADENCES = new Set(["weekly", "biweekly", "monthly", "quarterly", "yearly", "annually"]);
// Maximum number of missed occurrences to materialise in a single catch-up run.
// Prevents runaway transaction creation when next_run_date is far in the past.
const MAX_CATCHUP_RUNS = 52;

class RecurringTemplateValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RecurringTemplateValidationError";
    this.statusCode = 400;
  }
}

function parseIsoDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function utcToday() {
  return parseIsoDate(new Date().toISOString().slice(0, 10));
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month + months, 1));
  const lastDayOfMonth = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
  candidate.setUTCDate(Math.min(day, lastDayOfMonth));
  return candidate;
}

function computeNextOccurrence(currentDate, cadence) {
  switch (cadence) {
    case "weekly":
      return addDays(currentDate, 7);
    case "biweekly":
      return addDays(currentDate, 14);
    case "monthly":
      return addMonths(currentDate, 1);
    case "quarterly":
      return addMonths(currentDate, 3);
    case "yearly":
    case "annually":
      return addMonths(currentDate, 12);
    default:
      throw new Error(`Unsupported cadence: ${cadence}`);
  }
}

function normalizeRecurringPayload(payload = {}) {
  const description = String(payload.description || "").trim();
  const note = payload.note == null ? "" : String(payload.note).trim();
  const cadence = String(payload.cadence || "").trim().toLowerCase();
  const type = payload.type === "income" ? "income" : payload.type === "expense" ? "expense" : "";
  const amount = Number.parseFloat(payload.amount);
  const accountId = String(payload.account_id || "").trim();
  const categoryId = String(payload.category_id || "").trim();
  const startDate = parseIsoDate(payload.start_date);
  const endDate = payload.end_date ? parseIsoDate(payload.end_date) : null;
  const clearedDefault = payload.cleared_default === true;
  const active = payload.active !== false;

  if (!description) {
    return { valid: false, message: "description is required" };
  }
  if (!accountId) {
    return { valid: false, message: "account_id is required" };
  }
  if (!categoryId) {
    return { valid: false, message: "category_id is required" };
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) {
    return { valid: false, message: "amount must be greater than 0 and at most 999999999.99" };
  }
  if (!type) {
    return { valid: false, message: "type must be either 'income' or 'expense'" };
  }
  if (!VALID_CADENCES.has(cadence)) {
    return { valid: false, message: "cadence is invalid" };
  }
  if (!startDate) {
    return { valid: false, message: "start_date must be a valid date" };
  }
  if (payload.end_date && !endDate) {
    return { valid: false, message: "end_date must be a valid date" };
  }
  if (startDate && endDate && endDate < startDate) {
    return { valid: false, message: "end_date must be on or after start_date" };
  }

  return {
    valid: true,
    normalized: {
      description,
      note,
      cadence,
      type,
      amount,
      accountId,
      categoryId,
      startDate: formatIsoDate(startDate),
      endDate: endDate ? formatIsoDate(endDate) : null,
      clearedDefault,
      active
    }
  };
}

async function verifyTemplateOwnership(client, businessId, accountId, categoryId) {
  const [accountCheck, categoryCheck] = await Promise.all([
    client.query("SELECT id FROM accounts WHERE id = $1 AND business_id = $2", [accountId, businessId]),
    client.query("SELECT id FROM categories WHERE id = $1 AND business_id = $2", [categoryId, businessId])
  ]);

  if (!accountCheck.rowCount) {
    throw new RecurringTemplateValidationError("account_id does not belong to your business");
  }
  if (!categoryCheck.rowCount) {
    throw new RecurringTemplateValidationError("category_id does not belong to your business");
  }
}

function mapRecurringRow(row) {
  return {
    id: row.id,
    business_id: row.business_id,
    account_id: row.account_id,
    category_id: row.category_id,
    amount: Number(row.amount) || 0,
    type: row.type,
    description: row.description || "",
    note: row.note || "",
    cadence: row.cadence,
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
    next_run_date: row.next_run_date ? String(row.next_run_date).slice(0, 10) : "",
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : "",
    last_run_date: row.last_run_date ? String(row.last_run_date).slice(0, 10) : "",
    cleared_default: row.cleared_default === true,
    active: row.active === true,
    created_at: row.created_at || "",
    updated_at: row.updated_at || ""
  };
}

async function processDueRecurringTransactions(businessId) {
  const dueTemplates = await pool.query(
    `SELECT id, business_id, account_id, category_id, amount, type, description, note,
            cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
            created_at, updated_at
     FROM recurring_transactions
     WHERE business_id = $1
       AND active = TRUE
       AND next_run_date <= CURRENT_DATE
       AND (end_date IS NULL OR next_run_date <= end_date)
     ORDER BY next_run_date ASC`,
    [businessId]
  );

  for (const row of dueTemplates.rows) {
    await materializeTemplateRuns(businessId, row.id);
  }
}

async function materializeTemplateRuns(businessId, templateId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const templateResult = await client.query(
      `SELECT id, business_id, account_id, category_id, amount, type, description, note,
              cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
              created_at, updated_at
       FROM recurring_transactions
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [templateId, businessId]
    );

    if (!templateResult.rowCount) {
      await client.query("ROLLBACK");
      return;
    }

    const template = templateResult.rows[0];
    if (!template.active) {
      await client.query("COMMIT");
      return;
    }

    const allowance = await assertCanCreateTransactions(client, businessId, 0);
    let remainingBasicSlots = Number.isFinite(allowance.remaining) ? allowance.remaining : Number.POSITIVE_INFINITY;

    const lockState = await loadAccountingLockState(pool, businessId);

    let nextOccurrence = parseIsoDate(template.next_run_date);
    const endDate = template.end_date ? parseIsoDate(template.end_date) : null;
    const today = utcToday();
    let lastRunDate = template.last_run_date ? parseIsoDate(template.last_run_date) : null;
    let createdAny = false;
    let catchupCount = 0;

    while (nextOccurrence && nextOccurrence <= today && (!endDate || nextOccurrence <= endDate)) {
      if (catchupCount >= MAX_CATCHUP_RUNS) {
        // Cap reached: leave next_run_date pointing at the current occurrence so
        // the remaining backlog is processed on the next scheduled run.
        break;
      }
      const occurrenceDate = formatIsoDate(nextOccurrence);

      // Skip occurrences that fall inside a locked accounting period.
      if (isDateLocked(occurrenceDate, lockState?.lockedThroughDate)) {
        nextOccurrence = computeNextOccurrence(nextOccurrence, template.cadence);
        continue;
      }

      if (remainingBasicSlots <= 0) {
        break;
      }

      const runInsert = await client.query(
        `INSERT INTO recurring_transaction_runs
           (id, recurring_transaction_id, business_id, occurrence_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (recurring_transaction_id, occurrence_date) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), template.id, businessId, occurrenceDate]
      );

      if (runInsert.rowCount) {
        const transactionInsert = await client.query(
          `INSERT INTO transactions
             (id, business_id, account_id, category_id, amount, type, cleared,
              description, date, note, recurring_transaction_id, recurring_occurrence_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            crypto.randomUUID(),
            businessId,
            template.account_id,
            template.category_id,
            template.amount,
            template.type,
            template.cleared_default === true,
            template.description,
            occurrenceDate,
            template.note || null,
            template.id,
            occurrenceDate
          ]
        );

        await client.query(
          `UPDATE recurring_transaction_runs
           SET transaction_id = $1
           WHERE id = $2`,
          [transactionInsert.rows[0].id, runInsert.rows[0].id]
        );
        createdAny = true;
        if (Number.isFinite(remainingBasicSlots)) {
          remainingBasicSlots -= 1;
        }
      }

      lastRunDate = nextOccurrence;
      catchupCount++;
      nextOccurrence = computeNextOccurrence(nextOccurrence, template.cadence);
    }

    const nextRunDateText = nextOccurrence ? formatIsoDate(nextOccurrence) : null;
    const shouldRemainActive = nextOccurrence && (!endDate || nextOccurrence <= endDate);
    await client.query(
      `UPDATE recurring_transactions
       SET next_run_date = $1,
           last_run_date = $2,
           active = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        nextRunDateText || (endDate ? formatIsoDate(endDate) : formatIsoDate(today)),
        lastRunDate ? formatIsoDate(lastRunDate) : template.last_run_date,
        shouldRemainActive === true ? true : endDate ? false : template.active,
        template.id
      ]
    );

    await client.query("COMMIT");
    return createdAny;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function materializeNextTemplateRun(businessId, templateId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const templateResult = await client.query(
      `SELECT id, business_id, account_id, category_id, amount, type, description, note,
              cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
              created_at, updated_at
       FROM recurring_transactions
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [templateId, businessId]
    );

    if (!templateResult.rowCount) {
      await client.query("ROLLBACK");
      return { found: false, created: false };
    }

    const template = templateResult.rows[0];
    if (!template.active) {
      await client.query("ROLLBACK");
      return { found: true, created: false };
    }

    await assertCanCreateTransactions(client, businessId, 1);

    const occurrenceDate = parseIsoDate(template.next_run_date);
    const endDate = template.end_date ? parseIsoDate(template.end_date) : null;
    if (!occurrenceDate || (endDate && occurrenceDate > endDate)) {
      await client.query("ROLLBACK");
      return { found: true, created: false };
    }

    const occurrenceDateText = formatIsoDate(occurrenceDate);

    // Reject manual runs that would post into a locked accounting period.
    const lockState = await loadAccountingLockState(pool, businessId);
    if (isDateLocked(occurrenceDateText, lockState?.lockedThroughDate)) {
      await client.query("ROLLBACK");
      return { found: true, created: false, locked: true };
    }
    const runInsert = await client.query(
      `INSERT INTO recurring_transaction_runs
         (id, recurring_transaction_id, business_id, occurrence_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recurring_transaction_id, occurrence_date) DO NOTHING
       RETURNING id`,
      [crypto.randomUUID(), template.id, businessId, occurrenceDateText]
    );

    if (!runInsert.rowCount) {
      await client.query("ROLLBACK");
      return { found: true, created: false };
    }

    const transactionInsert = await client.query(
      `INSERT INTO transactions
         (id, business_id, account_id, category_id, amount, type, cleared,
          description, date, note, recurring_transaction_id, recurring_occurrence_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        crypto.randomUUID(),
        businessId,
        template.account_id,
        template.category_id,
        template.amount,
        template.type,
        template.cleared_default === true,
        template.description,
        occurrenceDateText,
        template.note || null,
        template.id,
        occurrenceDateText
      ]
    );

    await client.query(
      `UPDATE recurring_transaction_runs
       SET transaction_id = $1
       WHERE id = $2`,
      [transactionInsert.rows[0].id, runInsert.rows[0].id]
    );

    const nextRunDate = computeNextOccurrence(occurrenceDate, template.cadence);
    const nextRunDateText = formatIsoDate(nextRunDate);
    const shouldRemainActive = !endDate || nextRunDate <= endDate;

    await client.query(
      `UPDATE recurring_transactions
       SET next_run_date = $1,
           last_run_date = $2,
           active = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [nextRunDateText, occurrenceDateText, shouldRemainActive, template.id]
    );

    await client.query("COMMIT");
    return { found: true, created: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function computeNextRunDateForUpdate(normalized, previousTemplate) {
  const today = utcToday();
  const startDate = parseIsoDate(normalized.startDate);
  const endDate = normalized.endDate ? parseIsoDate(normalized.endDate) : null;
  let candidate = startDate;

  if (previousTemplate?.last_run_date) {
    const lastRun = parseIsoDate(previousTemplate.last_run_date);
    if (lastRun) {
      candidate = computeNextOccurrence(lastRun, normalized.cadence);
    }
  }

  while (candidate && candidate < today && (!endDate || candidate <= endDate)) {
    candidate = computeNextOccurrence(candidate, normalized.cadence);
  }

  if (candidate && endDate && candidate > endDate) {
    return { nextRunDate: formatIsoDate(candidate), active: false };
  }

  // Safety guard: if the candidate is still in the past (edge case where
  // endDate stopped loop advancement and the >endDate check above did not fire
  // because candidate == endDate), mark the template inactive to prevent
  // unexpected immediate materialisation.
  if (normalized.active && candidate && candidate < today) {
    return { nextRunDate: formatIsoDate(candidate), active: false };
  }

  return {
    nextRunDate: formatIsoDate(candidate || today),
    active: normalized.active
  };
}

/**
 * Returns the next N upcoming run dates for a template, given its current
 * next_run_date, cadence, and end_date. Stops at end_date when present.
 */
function projectUpcomingOccurrences(template, count = 5) {
  const out = [];
  if (!template?.next_run_date || !template?.cadence) return out;
  let cursor = parseIsoDate(template.next_run_date);
  const endDate = template.end_date ? parseIsoDate(template.end_date) : null;
  const safeCount = Math.max(0, Math.min(Number(count) || 0, 50));
  for (let i = 0; i < safeCount; i++) {
    if (!cursor) break;
    if (endDate && cursor > endDate) break;
    out.push(formatIsoDate(cursor));
    cursor = computeNextOccurrence(cursor, template.cadence);
  }
  return out;
}

module.exports = {
  VALID_CADENCES,
  RecurringTemplateValidationError,
  normalizeRecurringPayload,
  processDueRecurringTransactions,
  materializeTemplateRuns,
  materializeNextTemplateRun,
  verifyTemplateOwnership,
  mapRecurringRow,
  computeNextRunDateForUpdate,
  projectUpcomingOccurrences,
  __private: { parseIsoDate, formatIsoDate, computeNextOccurrence, utcToday }
};
