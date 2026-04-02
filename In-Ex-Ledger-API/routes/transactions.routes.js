const express = require('express');
const crypto = require('node:crypto');
const { pool } = require('../db.js');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');

// ... all the rest of your code, unchanged

module.exports = router;