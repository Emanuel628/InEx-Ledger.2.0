"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getQuarterlyReminders,
  __private: { diffDaysIso, todayIso, materializeSchedule }
} = require("../services/quarterlyTaxReminderService.js");

function makeDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

test("diffDaysIso computes forward and backward day deltas", () => {
  assert.equal(diffDaysIso("2026-04-10", "2026-04-15"), 5);
  assert.equal(diffDaysIso("2026-04-20", "2026-04-15"), -5);
});

test("todayIso formats a Date as YYYY-MM-DD in UTC", () => {
  assert.equal(todayIso(makeDate("2026-05-11")), "2026-05-11");
});

test("US schedule includes Q4 due Jan 15 of the following year", () => {
  const items = materializeSchedule("US", makeDate("2026-05-11"));
  const q4 = items.find((it) => it.label === "Q4" && it.due_date === "2027-01-15");
  assert.ok(q4, "US Q4 should fall in 2027 when computing from 2026");
});

test("CA schedule keeps Q4 in December of the same year", () => {
  const items = materializeSchedule("CA", makeDate("2026-05-11"));
  const q4 = items.find((it) => it.label === "Q4");
  assert.equal(q4.due_date, "2026-12-15");
});

test("getQuarterlyReminders returns due_soon when within reminder window", () => {
  const today = makeDate("2026-06-03");
  const result = getQuarterlyReminders("US", { today });
  assert.equal(result.region, "US");
  assert.equal(result.next_deadline.label, "Q2");
  assert.equal(result.next_deadline.due_date, "2026-06-15");
  assert.equal(result.next_deadline.days_until, 12);
  assert.equal(result.next_deadline.status, "due_soon");
  assert.equal(result.banner_level, "due_soon");
});

test("getQuarterlyReminders marks status upcoming when far out", () => {
  const today = makeDate("2026-02-01");
  const result = getQuarterlyReminders("US", { today });
  assert.equal(result.next_deadline.label, "Q1");
  assert.equal(result.next_deadline.status, "upcoming");
  assert.equal(result.banner_level, "ok");
});

test("getQuarterlyReminders works for CA region and surfaces Q1 in March", () => {
  const today = makeDate("2026-02-15");
  const result = getQuarterlyReminders("CA", { today });
  assert.equal(result.region, "CA");
  assert.equal(result.next_deadline.label, "Q1");
  assert.equal(result.next_deadline.due_date, "2026-03-15");
});

test("getQuarterlyReminders defaults to US when region is unknown", () => {
  const result = getQuarterlyReminders("XX", { today: makeDate("2026-02-01") });
  assert.equal(result.region, "US");
});
