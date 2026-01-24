import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

// Enable CORS so your frontend can talk to this API
app.use(cors());
app.use(express.json());

// Title: Request Logger Middleware
app.use((req, res, next) => {
  console.log(`Incoming: ${req.method} ${req.url} - Body Keys: ${Object.keys(req.body)}`);
  next();
});

// Mount all routes under /api
app.use("/api", routes);

// Health check to verify the server is live
app.get("/", (req, res) => res.send("In-Ex Ledger API is Online"));

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();
