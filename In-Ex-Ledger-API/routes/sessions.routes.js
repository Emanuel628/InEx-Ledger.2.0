import express from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(requireAuth);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * GET /api/sessions
 * Lists all active (non-revoked, non-expired) sessions for the current user.
 */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, created_at, expires_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /sessions error:", err.message);
    res.status(500).json({ error: "Failed to load sessions." });
  }
});

/**
 * DELETE /api/sessions/:id
 * Revokes a specific session by its record ID.
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE refresh_tokens SET revoked = true WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }
    res.json({ message: "Session revoked." });
  } catch (err) {
    console.error("DELETE /sessions/:id error:", err.message);
    res.status(500).json({ error: "Failed to revoke session." });
  }
});

/**
 * DELETE /api/sessions
 * Revokes ALL sessions for the current user (sign out everywhere).
 */
router.delete("/", async (req, res) => {
  try {
    await pool.query(
      "UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false",
      [req.user.id]
    );
    res.json({ message: "All sessions revoked." });
  } catch (err) {
    console.error("DELETE /sessions error:", err.message);
    res.status(500).json({ error: "Failed to revoke sessions." });
  }
});

export default router;
