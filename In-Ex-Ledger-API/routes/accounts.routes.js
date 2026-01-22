import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/accounts", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.post("/accounts", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.put("/accounts/:id", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

export default router;