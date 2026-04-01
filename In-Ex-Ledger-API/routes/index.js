import express from "express";

import authRoutes from "./auth.routes.js";
import accountsRoutes from "./accounts.routes.js";
import receiptsRoutes from "./receipts.routes.js";
import categoriesRoutes from "./categories.routes.js";
import exportsRoutes from "./exports.routes.js";
import businessRoutes from "./business.routes.js";
import systemRoutes from "./system.routes.js";
import meRoutes from "./me.routes.js";
import cryptoRoutes from "./crypto.routes.js";
import privacyRoutes from "./privacy.routes.js";
import mileageRoutes from "./mileage.routes.js";
import sessionsRoutes from "./sessions.routes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/accounts", accountsRoutes);
router.use("/receipts", receiptsRoutes);
router.use("/categories", categoriesRoutes);
router.use("/exports", exportsRoutes);
router.use("/business", businessRoutes);
router.use("/system", systemRoutes);
router.use("/me", meRoutes);
router.use("/crypto", cryptoRoutes);
router.use("/privacy", privacyRoutes);
router.use("/mileage", mileageRoutes);
router.use("/sessions", sessionsRoutes);

export default router;
