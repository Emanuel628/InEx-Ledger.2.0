import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { initDatabase } from "./db.js";

const app = express();

// Title: Port Discovery
const PORT = process.env.PORT || 8080;
console.log(`SYSTEM_INFO: Railway requested Port ${process.env.PORT}`);
const shouldAutoInitDb = process.env.AUTO_INIT_DB !== "false";

const runMigrations = async () => {
  try {
    await initDatabase();
    console.log("DATABASE SCHEMA APPLIED SUCCESSFULLY.");
  } catch (err) {
    console.error("Schema initialization failed:", err);
  }
};

app.use(cors());
app.use(express.json());

// Basic health check for Railway
app.get("/", (req, res) => {
  res.status(200).send("API_UP");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Title: Request Logger Middleware
app.use((req, res, next) => {
  console.log(`Incoming: ${req.method} ${req.url} - Body Keys: ${Object.keys(req.body)}`);
  next();
});

// Title: API Routing
app.use("/api", routes);

// Title: The Watchdog Distractor
setInterval(() => {
  // keep the event loop warm
}, 1000 * 60 * 10);

;(async () => {
  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`API running on port ${PORT}`);
    });

    if (shouldAutoInitDb) {
      runMigrations();
    } else {
      console.log("AUTO_INIT_DB=false → skipping startup migrations.");
    }
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();

process.on("SIGTERM", () => {
  console.log("Railway sent SIGTERM — process still alive");
});
