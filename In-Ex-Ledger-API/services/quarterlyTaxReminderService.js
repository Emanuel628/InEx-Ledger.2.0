"use strict";

// Quarterly estimated tax due dates per region. (MM-DD)
// Sources: IRS Form 1040-ES; CRA installment payment schedule for self-employed.
const SCHEDULES = {
  US: [
    { label: "Q1", monthDay: "04-15" },
    { label: "Q2", monthDay: "06-15" },
    { label: "Q3", monthDay: "09-15" },
    { label: "Q4", monthDay: "01-15" }
  ],
  CA: [
    { label: "Q1", monthDay: "03-15" },
    { label: "Q2", monthDay: "06-15" },
    { label: "Q3", monthDay: "09-15" },
    { label: "Q4", monthDay: "12-15" }
  ]
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayIso(today = new Date()) {
  return `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
}

function diffDaysIso(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/**
 * Materialize the schedule into concrete ISO dates around `today`. US Q4 due
 * date falls in the following year, so its calendar year is `year + 1`.
 */
function materializeSchedule(region, today = new Date()) {
  const schedule = SCHEDULES[region] || SCHEDULES.US;
  const baseYear = today.getUTCFullYear();
  const items = [];
  for (const entry of schedule) {
    // CA Q4 (12-15) belongs to current year. US Q4 (01-15) belongs to next year (next year filing for current year income).
    const year = region === "US" && entry.label === "Q4" ? baseYear + 1 : baseYear;
    items.push({
      label: entry.label,
      due_date: `${year}-${entry.monthDay}`,
      tax_year: region === "US" && entry.label === "Q4" ? baseYear : baseYear
    });
  }
  // Also include last year's Q4 / next year's Q1 to ensure we always have a
  // future-or-just-past option to surface.
  if (region === "US") {
    items.push({
      label: "Q4",
      due_date: `${baseYear}-01-15`,
      tax_year: baseYear - 1
    });
  }
  items.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  return items;
}

/**
 * Returns:
 *  - region
 *  - all upcoming deadlines this calendar year
 *  - the next deadline + days_until + a banner-ready level: ok | upcoming | due_soon | overdue
 */
function getQuarterlyReminders(region, { today = new Date(), reminderLeadDays = 14 } = {}) {
  const safeRegion = region === "CA" ? "CA" : "US";
  const now = todayIso(today);
  const schedule = materializeSchedule(safeRegion, today);

  const annotated = schedule.map((entry) => {
    const days = diffDaysIso(now, entry.due_date);
    let status;
    if (days < 0) status = "passed";
    else if (days === 0) status = "due_today";
    else if (days <= reminderLeadDays) status = "due_soon";
    else status = "upcoming";
    return { ...entry, days_until: days, status };
  });

  const future = annotated.filter((entry) => entry.days_until >= 0);
  const next = future[0] || null;

  let bannerLevel = "ok";
  if (next) {
    if (next.status === "due_today") bannerLevel = "due_soon";
    else if (next.status === "due_soon") bannerLevel = "due_soon";
    else if (next.status === "upcoming") bannerLevel = "ok";
  }

  return {
    region: safeRegion,
    today: now,
    reminder_lead_days: reminderLeadDays,
    next_deadline: next,
    upcoming: future.slice(0, 4),
    banner_level: bannerLevel,
    all_this_year: annotated
  };
}

module.exports = {
  getQuarterlyReminders,
  SCHEDULES,
  __private: { materializeSchedule, diffDaysIso, todayIso }
};
