import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { initDatabase } from "./db.js";

const app = express();

// Title: Port Discovery
const PORT = process.env.PORT || 8080;
console.log(`SYSTEM_INFO: Railway requested Port ${process.env.PORT}`);

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

// Title: Mandatory Root Handler
app.get("/", (req, res) => res.status(200).send("API_UP"));

// Title: API Routing
app.use("/api", routes);

// Title: The Watchdog Distractor
setInterval(() => {
  // keep the event loop warm
}, 1000 * 60 * 10);

;(async () => {
  try {
    await initDatabase();
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
