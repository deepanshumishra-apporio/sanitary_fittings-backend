import { handle } from "../lib/handler";
import {
  createCompanySchema,
  updateCompanySchema,
  upsertCompanyVendorSchema,
} from "../validations/company.validation";
import * as companyService from "../services/company.service";

export const listCompanies = handle(async (_req, res) => {
  const companies = await companyService.listCompanies();
  res.json({ success: true, data: companies });
});

export const getCompany = handle(async (req, res) => {
  const company = await companyService.getCompany(req.params.id as string);
  res.json({ success: true, data: company });
});

export const createCompany = handle(async (req, res) => {
  const body = createCompanySchema.parse(req.body);
  const company = await companyService.createCompany(body);
  res.status(201).json({ success: true, data: company });
});

export const updateCompany = handle(async (req, res) => {
  const body = updateCompanySchema.parse(req.body);
  const company = await companyService.updateCompany(req.params.id as string, body);
  res.json({ success: true, data: company });
});

export const deleteCompany = handle(async (req, res) => {
  await companyService.deleteCompany(req.params.id as string);
  res.json({ success: true, message: "Company deleted" });
});

export const listCompanyVendors = handle(async (req, res) => {
  const vendors = await companyService.listCompanyVendors(req.params.companyId as string);
  res.json({ success: true, data: vendors });
});

export const upsertCompanyVendor = handle(async (req, res) => {
  const body = upsertCompanyVendorSchema.parse(req.body);
  const mapping = await companyService.upsertCompanyVendor(req.params.companyId as string, body);
  res.status(201).json({ success: true, data: mapping });
});

export const removeCompanyVendor = handle(async (req, res) => {
  await companyService.removeCompanyVendor(req.params.companyId as string, req.params.vendorId as string);
  res.json({ success: true, message: "Vendor removed from company" });
});
