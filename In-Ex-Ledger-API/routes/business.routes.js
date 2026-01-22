import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/business", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.put("/business", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

export default router;