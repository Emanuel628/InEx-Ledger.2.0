import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/me", requireAuth, (req, res) => {
  res.status(200).json(req.user);
});

router.delete("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1", [
      req.user.id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ message: "Account and data deleted" });
  } catch (err) {
    console.error("DELETE /me error:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
