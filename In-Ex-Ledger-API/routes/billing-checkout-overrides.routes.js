const express = require("express");

// Reserved for narrow checkout overrides. Keep as a valid router so the route
// stack stays safe even when no override is active.
const router = express.Router();

module.exports = router;
