import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/me", requireAuth, (req, res) => {
  res.status(200).json(req.user);
});

export default router;