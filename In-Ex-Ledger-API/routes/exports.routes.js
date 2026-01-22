import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/exports/csv", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.post("/exports/pdf", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

export default router;