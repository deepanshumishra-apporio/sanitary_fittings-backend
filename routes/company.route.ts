import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  listCompanyVendors,
  upsertCompanyVendor,
  removeCompanyVendor,
} from "../controllers/company.controller";

const companyRoutes = Router();

companyRoutes.get("/", listCompanies);
companyRoutes.get("/:id", getCompany);
companyRoutes.get("/:companyId/vendor", listCompanyVendors);

companyRoutes.post("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), createCompany);
companyRoutes.patch("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), updateCompany);
companyRoutes.delete("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), deleteCompany);
companyRoutes.post("/:companyId/vendor", requireAuth, requireRole("ADMIN", "SUBADMIN"), upsertCompanyVendor);
companyRoutes.delete("/:companyId/vendor/:vendorId", requireAuth, requireRole("ADMIN", "SUBADMIN"), removeCompanyVendor);

export default companyRoutes;
