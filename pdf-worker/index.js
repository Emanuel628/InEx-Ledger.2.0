import express from "express";
import dotenv from "dotenv";
import { importJWK, compactDecrypt } from "jose";

dotenv.config();

const PORT = Number(process.env.PORT || 9080);
const WORKER_SECRET = process.env.PDF_WORKER_SECRET;
const PRIVATE_KEY_JWK = process.env.PDF_WORKER_PRIVATE_KEY_JWK;

if (!WORKER_SECRET) {
  throw new Error("Missing PDF_WORKER_SECRET (shared secret for API traffic).");
}

if (!PRIVATE_KEY_JWK) {
  throw new Error("Missing PDF_WORKER_PRIVATE_KEY_JWK (attested RSA key material).");
}

let cachedPrivateKey = null;

async function getPrivateKey() {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }
  const parsed = JSON.parse(PRIVATE_KEY_JWK);
  cachedPrivateKey = await importJWK(parsed, "RSA-OAEP-256");
  return cachedPrivateKey;
}

async function decryptTaxId(jwe) {
  if (!jwe) return null;
  const key = await getPrivateKey();
  const { plaintext } = await compactDecrypt(jwe, key);
  return new TextDecoder().decode(plaintext);
}

function encodeBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function buildPdfContent(job, taxId, redact = false) {
  const header = `Export ${job.jobId}\nRange: ${job.startDate} to ${job.endDate}\n`;
  const taxLine = redact
    ? "Tax ID: [REDACTED]"
    : `Tax ID: ${taxId ?? "Not provided"}`;
  const body = `${header}${taxLine}\nGenerated at ${new Date().toISOString()}`;
  return Buffer.from(body, "utf-8");
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const token = req.headers["x-worker-token"];
  if (token !== WORKER_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.post("/generate", async (req, res) => {
  const job = req.body || {};
  const includeTaxId = Boolean(job.includeTaxId);
  try {
    const taxId = includeTaxId ? await decryptTaxId(job.taxId_jwe) : null;
    const fullPdfBuffer = buildPdfContent(job, taxId, false);
    const redactedPdfBuffer = buildPdfContent(job, taxId, true);

    res.json({
      jobId: job.jobId,
      fullPdf: encodeBase64(fullPdfBuffer),
      redactedPdf: encodeBase64(redactedPdfBuffer),
      metadata: {
        language: job.exportLang || "en",
        currency: job.currency || "USD",
        pageCount: 2,
        taxIdIncluded: includeTaxId && Boolean(taxId)
      }
    });
  } catch (err) {
    console.error("Worker failed:", err?.message || err);
    res.status(500).json({ error: "Failed to generate PDF." });
  }
});

app.listen(PORT, () => {
  console.log(`pdf-worker listening on port ${PORT}`);
});
