import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/categories", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.post("/categories", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.put("/categories/:id", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

export default router;