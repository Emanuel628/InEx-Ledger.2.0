const express = require("express");
const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "luna-business",
    timestamp: new Date().toISOString()
  });
});

router.get("/links", (req, res) => {
  res.json({
    login: "/login",
    register: "/register",
    transactions: "/transactions",
    settings: "/settings",
    exports: "/exports"
  });
});

module.exports = router;