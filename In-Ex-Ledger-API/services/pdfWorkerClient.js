const { logError, logWarn, logInfo } = require("../utils/logger.js");
const WORKER_BASE_URL = (process.env.PDF_WORKER_URL || "").replace(/\/+$/, "");
const WORKER_SECRET = process.env.PDF_WORKER_SECRET;
const WORKER_TIMEOUT_MS = Number(process.env.PDF_WORKER_TIMEOUT_MS || 15_000);

async function callWorker(job) {
  if (!WORKER_BASE_URL || !WORKER_SECRET) {
    throw new Error(
      "PDF worker is not configured. Set PDF_WORKER_URL and PDF_WORKER_SECRET environment variables."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const response = await fetch(`${WORKER_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Token": WORKER_SECRET
      },
      body: JSON.stringify(job),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Worker error ${response.status}: ${body}`);
    }

    const payload = await response.json();
    return {
      fullPdfBuffer: Buffer.from(payload.fullPdf, "base64"),
      redactedPdfBuffer: Buffer.from(payload.redactedPdf, "base64"),
      metadata: payload.metadata || {}
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function dispatchPdfJob(job) {
  try {
    return await callWorker(job);
  } catch (err) {
    logError("PDF worker dispatch failed:", err.message);
    throw err;
  }
}

module.exports = { dispatchPdfJob };
