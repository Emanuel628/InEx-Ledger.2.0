// GET /check-email-verified
// Returns { verified: true/false } for a given email
const express = require('express');
const router = express.Router();
const { pool } = require('../db.js');

router.get('/check-email-verified', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const result = await pool.query('SELECT email_verified FROM users WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ verified: !!result.rows[0].email_verified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

module.exports = router;
