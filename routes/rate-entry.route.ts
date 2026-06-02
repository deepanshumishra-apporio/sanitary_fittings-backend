import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { createRateEntry, listRateEntries } from "../controllers/rate-entry.controller";

const rateEntryRoutes = Router();

rateEntryRoutes.get("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), listRateEntries);
rateEntryRoutes.post("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), createRateEntry);

export default rateEntryRoutes;
