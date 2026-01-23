import express from "express";
import routes from "./routes/index.js";
import { initDatabase } from "./db.js"; 

const app = express();

initDatabase();

app.use(express.json());

// Title: Request Logger Middleware
app.use((req, res, next) => {
  console.log(`Incoming: ${req.method} ${req.url} - Body Keys: ${Object.keys(req.body)}`);
  next();
});

app.use("/api", routes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 API active on port ${PORT}`);
});
