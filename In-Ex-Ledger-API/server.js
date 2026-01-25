import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes/index.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.join(__dirname, "..", "InEx-Ledger-Frontend");

console.log("🔥 DOCKER FINGERPRINT: CLEAN_BUILD_2026_01_24");

const PORT = process.env.PORT || 8080;
console.log(`SYSTEM_INFO: Railway requested Port ${process.env.PORT}`);
console.log("JWT_SECRET present:", !!process.env.JWT_SECRET);

app.use(cors({
  origin: [
    "https://lunafinance.org",
    "https://www.lunafinance.org",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  credentials: true
}));

app.use(express.static(frontendDir));
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "html", "landing.html"));
});
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// TEMP: Catch Railway's broken health probe
app.get("/Health Check Path: /", (req, res) => {
  res.status(200).send("OK");
});

// Also catch the URL-encoded version just in case
app.get("/Health%20Check%20Path:%20/", (req, res) => {
  res.status(200).send("OK");
});

app.use((req, res, next) => {
  console.log(`Incoming: ${req.method} ${req.url} - Body Keys: ${Object.keys(req.body)}`);
  next();
});

app.use("/api", routes);

setInterval(() => {
  // keep the event loop busy
}, 1000 * 60 * 10);

// TEMPORARILY DISABLED – database initialization removed for stability
// const runMigrations = async () => {
//   try {
//     await initDatabase();
//     console.log("DATABASE SCHEMA APPLIED SUCCESSFULLY.");
//   } catch (err) {
//     console.error("Schema initialization failed:", err);
//   }
// };

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

setInterval(() => {
  console.log("❤️ HEARTBEAT: server still alive");
}, 30000);
