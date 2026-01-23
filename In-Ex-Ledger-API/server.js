import express from "express";
import routes from "./routes/index.js";
import { initSchema } from "./db.js"; // Import the helper

const app = express();

app.use(express.json());

// Title: Initialize Database on Startup
initSchema();

// Title: API Routes
app.use("/api", routes);

// Simple health check
app.get("/", (req, res) => res.send("Luna Business API is Live"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
