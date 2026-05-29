"use strict";

require("dotenv").config();

const { initDatabase } = require("../db.js");
const { runEmailReminderSweep } = require("../services/emailReminderService.js");

async function main() {
  await initDatabase();
  const summary = await runEmailReminderSweep();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("send-email-reminders failed:", error?.message || error);
  process.exit(1);
});
