import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";
import transactionsRouter from "./routes/transactions.routes.js";
import { initDatabase } from "./db.js";

const app = express();
const publicDir = path.join(process.cwd(), "public");

/* =========================================================
   CORS & SECURITY CONFIGURATION
   ========================================================= */
const ALLOWED_ORIGINS = [
  "https://inexledger.com",
  "https://www.inexledger.com",
  "https://inex-ledger20-production.up.railway.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

console.log("SYSTEM START: INEX_LEDGER_PROD_2026");

const PORT = process.env.PORT || 8080;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 15000);
console.log(`NETWORK: Port assigned: ${PORT}`);
console.log("SECURITY: JWT_SECRET detected:", !!process.env.JWT_SECRET);

let dbState = "starting";
let dbLastError = null;
let dbInitPromise = null;

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked request from ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

/* =========================================================
   MIDDLEWARE STACK
   ========================================================= */
app.use(express.static(publicDir));
app.use(express.static(path.join(publicDir, "html")));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());

/* =========================================================
   SYSTEM ROUTES (HEALTH & STATIC)
   ========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: dbState === "ready" ? "healthy" : "starting",
    database: {
      state: dbState,
      lastError: dbLastError
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/favicon.ico", (req, res) => {
  res.redirect(301, "/favicon.svg");
});

app.get("/favicon.svg", (req, res) => {
  res.sendFile(path.join(publicDir, "favicon.svg"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "html", "landing.html"));
});

/* =========================================================
   API ROUTES
   ========================================================= */

app.use("/api/transactions", transactionsRouter);
console.log("MOUNTED: /api/transactions");

app.use("/api", routes);
console.log("MOUNTED: /api (Core Routes)");

/* =========================================================
   SERVER INITIALIZATION
   ========================================================= */

let server;

async function initializeDatabaseWithRetry() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    while (true) {
      try {
        await initDatabase();
        dbState = "ready";
        dbLastError = null;
        console.log("Database initialization completed.");
        return;
      } catch (err) {
        dbState = "retrying";
        dbLastError = err?.message || String(err);
        console.error("Database initialization failed:", err);
        console.log(`Retrying database initialization in ${DB_RETRY_DELAY_MS}ms.`);
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
      }
    }
  })();

  return dbInitPromise;
}

function registerShutdownHandlers() {
  process.on("SIGTERM", () => {
    console.log("SIGTERM: Shutdown signal received.");
    server.close(() => {
      console.log("Server closed safely. Goodbye!");
      process.exit(0);
    });
  });
}

async function start() {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`READY: InEx Ledger API live on port ${PORT}`);
  });

  registerShutdownHandlers();
  void initializeDatabaseWithRetry();
}

start();
