import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

const PORT = process.env.PORT || 8080;
console.log(`SYSTEM_INFO: Railway requested Port ${process.env.PORT}`);
console.log("JWT_SECRET present:", !!process.env.JWT_SECRET);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("API_UP");
});

app.get("/health", (req, res) => {
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
