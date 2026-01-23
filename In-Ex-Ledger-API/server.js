import express from "express";
import routes from "./routes/index.js";
import { initDatabase } from "./db.js"; 

const app = express();

// Title: Initialize Database
// This will now find the file in /db/migrations/
initDatabase();

app.use(express.json());

// Title: API Routes
app.use("/api", routes);

// Standard Railway Port
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 API is live on port ${PORT}`);
});
