import express from "express";
import cors from "cors";
import path from "path";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";
import transactionsRouter from "./routes/transactions.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";

const app = express();
const publicDir = path.join(process.cwd(), "public");
const ALLOWED_ORIGINS = [
  "https://lunafinance.org",
  "https://www.lunafinance.org",
  "https://inex-ledger20-production.up.railway.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

console.log("🔥 DOCKER FINGERPRINT: CLEAN_BUILD_2026_01_24");

const PORT = process.env.PORT || 8080;
console.log(`SYSTEM_INFO: Railway requested Port ${process.env.PORT}`);
console.log("JWT_SECRET present:", !!process.env.JWT_SECRET);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));

app.use(express.static(publicDir));
app.use(express.static(path.join(publicDir, "html")));

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "html", "landing.html"));
});

app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || "unknown"
  });
});

app.use("/api/transactions", transactionsRouter);
console.log("Mounted /api/transactions");
app.use("/api", routes);

app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.user);
});

;(async () => {
  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();

process.on("SIGTERM", () => {
  console.log("Railway sent SIGTERM — process still alive");
});
