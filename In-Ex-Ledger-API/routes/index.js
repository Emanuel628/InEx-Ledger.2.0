import express from "express";

import authRoutes from "./auth.routes.js";
import accountsRoutes from "./accounts.routes.js";
import transactionsRoutes from "./transactions.routes.js";
import receiptsRoutes from "./receipts.routes.js";
import categoriesRoutes from "./categories.routes.js";
import exportsRoutes from "./exports.routes.js";
import businessRoutes from "./business.routes.js";
import systemRoutes from "./system.routes.js";
import meRoutes from "./me.routes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/accounts", accountsRoutes);
router.use("/transactions", transactionsRoutes);
router.use("/receipts", receiptsRoutes);
router.use("/categories", categoriesRoutes);
router.use("/exports", exportsRoutes);
router.use("/business", businessRoutes);
router.use("/system", systemRoutes);
router.use("/me", meRoutes);

export default router;