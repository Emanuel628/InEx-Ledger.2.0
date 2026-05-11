"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  projectUpcomingOccurrences
} = require("../services/recurringTransactionsService.js");

test("projectUpcomingOccurrences returns the next N monthly dates", () => {
  const dates = projectUpcomingOccurrences({
    next_run_date: "2026-05-15",
    cadence: "monthly",
    end_date: null
  }, 3);
  assert.deepEqual(dates, ["2026-05-15", "2026-06-15", "2026-07-15"]);
});

test("projectUpcomingOccurrences honors weekly cadence", () => {
  const dates = projectUpcomingOccurrences({
    next_run_date: "2026-05-01",
    cadence: "weekly",
    end_date: null
  }, 4);
  assert.deepEqual(dates, ["2026-05-01", "2026-05-08", "2026-05-15", "2026-05-22"]);
});

test("projectUpcomingOccurrences stops at end_date", () => {
  const dates = projectUpcomingOccurrences({
    next_run_date: "2026-05-01",
    cadence: "monthly",
    end_date: "2026-06-30"
  }, 10);
  assert.deepEqual(dates, ["2026-05-01", "2026-06-01"]);
});

test("projectUpcomingOccurrences caps at 50 occurrences", () => {
  const dates = projectUpcomingOccurrences({
    next_run_date: "2026-01-01",
    cadence: "monthly",
    end_date: null
  }, 1000);
  assert.equal(dates.length, 50);
});

test("projectUpcomingOccurrences returns empty when next_run_date is missing", () => {
  assert.deepEqual(projectUpcomingOccurrences({}, 5), []);
  assert.deepEqual(projectUpcomingOccurrences({ cadence: "monthly" }, 5), []);
});

test("projectUpcomingOccurrences handles biweekly and quarterly", () => {
  assert.deepEqual(
    projectUpcomingOccurrences({ next_run_date: "2026-01-01", cadence: "biweekly", end_date: null }, 3),
    ["2026-01-01", "2026-01-15", "2026-01-29"]
  );
  assert.deepEqual(
    projectUpcomingOccurrences({ next_run_date: "2026-01-15", cadence: "quarterly", end_date: null }, 3),
    ["2026-01-15", "2026-04-15", "2026-07-15"]
  );
});

test("projectUpcomingOccurrences handles yearly cadence", () => {
  assert.deepEqual(
    projectUpcomingOccurrences({ next_run_date: "2026-04-15", cadence: "yearly", end_date: null }, 3),
    ["2026-04-15", "2027-04-15", "2028-04-15"]
  );
});

test("projectUpcomingOccurrences returns empty for zero count", () => {
  assert.deepEqual(
    projectUpcomingOccurrences({ next_run_date: "2026-05-01", cadence: "monthly", end_date: null }, 0),
    []
  );
});
