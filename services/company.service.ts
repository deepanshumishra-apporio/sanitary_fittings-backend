import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateCompanyDto, UpdateCompanyDto, UpsertCompanyVendorDto } from "../validations/company.validation";

const companyInclude = {
  _count: { select: { products: true, vendors: true } },
};

export async function listCompanies() {
  return prisma.company.findMany({
    include: companyInclude,
    orderBy: { name: "asc" },
  });
}

export async function getCompany(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      vendors: {
        include: { vendor: { select: { id: true, name: true, email: true, phone: true } } },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      },
      _count: { select: { products: true, vendors: true } },
    },
  });
  if (!company) throw new AppError(404, "Company not found");
  return company;
}

export async function createCompany(dto: CreateCompanyDto) {
  const exists = await prisma.company.findUnique({ where: { name: dto.name } });
  if (exists) throw new AppError(409, "Company with this name already exists");

  return prisma.company.create({ data: dto, include: companyInclude });
}

export async function updateCompany(id: string, dto: UpdateCompanyDto) {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new AppError(404, "Company not found");

  if (dto.name && dto.name !== company.name) {
    const exists = await prisma.company.findUnique({ where: { name: dto.name } });
    if (exists) throw new AppError(409, "Company with this name already exists");
  }

  return prisma.company.update({ where: { id }, data: dto, include: companyInclude });
}

export async function deleteCompany(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { products: true, vendors: true, rateEntries: true } },
    },
  });
  if (!company) throw new AppError(404, "Company not found");
  if (company._count.products > 0 || company._count.vendors > 0 || company._count.rateEntries > 0) {
    throw new AppError(409, "Company is linked to products, vendors, or rates and cannot be deleted");
  }

  await prisma.company.delete({ where: { id } });
}

export async function listCompanyVendors(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new AppError(404, "Company not found");

  return prisma.companyVendor.findMany({
    where: { companyId },
    include: { vendor: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

export async function upsertCompanyVendor(companyId: string, dto: UpsertCompanyVendorDto) {
  const [company, vendor] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }),
    prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }),
  ]);

  if (!company) throw new AppError(404, "Company not found");
  if (!vendor) throw new AppError(404, "Vendor not found");

  return prisma.companyVendor.upsert({
    where: { companyId_vendorId: { companyId, vendorId: dto.vendorId } },
    update: {
      ...(dto.code !== undefined && { code: dto.code }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    },
    create: {
      companyId,
      vendorId: dto.vendorId,
      code: dto.code,
      isActive: dto.isActive ?? true,
    },
    include: { vendor: { select: { id: true, name: true, email: true, phone: true } } },
  });
}

export async function removeCompanyVendor(companyId: string, vendorId: string) {
  const mapping = await prisma.companyVendor.findUnique({
    where: { companyId_vendorId: { companyId, vendorId } },
    select: { id: true },
  });
  if (!mapping) throw new AppError(404, "Vendor is not linked to this company");

  const linkedRates = await prisma.rateEntry.count({ where: { companyId, vendorId } });
  if (linkedRates > 0) {
    throw new AppError(409, "Vendor has rate history for this company and cannot be removed");
  }

  await prisma.companyVendor.delete({ where: { companyId_vendorId: { companyId, vendorId } } });
}
