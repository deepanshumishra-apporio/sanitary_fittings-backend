import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateRateEntryDto, RateEntryQueryDto } from "../validations/rate-entry.validation";

const rateEntryInclude = {
  product: {
    select: {
      id: true,
      name: true,
      categoryId: true,
      subCategoryId: true,
      companyId: true,
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
    },
  },
  company: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true, email: true, phone: true } },
};

function normaliseDateRange(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return undefined;

  return {
    ...(dateFrom && { gte: dateFrom }),
    ...(dateTo && { lte: dateTo }),
  };
}

export async function listRateEntries(query: RateEntryQueryDto) {
  const {
    page,
    limit,
    search,
    categoryId,
    subCategoryId,
    companyId,
    vendorId,
    latestOnly,
    dateFrom,
    dateTo,
  } = query;

  const effectiveDate = normaliseDateRange(dateFrom, dateTo);
  const where = {
    ...(companyId && { companyId }),
    ...(vendorId && { vendorId }),
    ...(effectiveDate && { effectiveDate }),
    product: {
      ...(categoryId && { categoryId }),
      ...(subCategoryId && { subCategoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    },
  };

  const skip = (page - 1) * limit;

  const [rows, allLatestRows, totalHistory] = await Promise.all([
    prisma.rateEntry.findMany({
      where,
      include: rateEntryInclude,
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      ...(latestOnly && { distinct: ["productId", "vendorId", "companyId"] }),
      skip,
      take: limit,
    }),
    latestOnly
      ? prisma.rateEntry.findMany({
          where,
          distinct: ["productId", "vendorId", "companyId"],
          select: { id: true },
          orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    latestOnly ? Promise.resolve(0) : prisma.rateEntry.count({ where }),
  ]);

  const total = latestOnly ? allLatestRows.length : totalHistory;

  return {
    data: rows,
    meta: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function createRateEntry(dto: CreateRateEntryDto) {
  const [product, vendor, company, mapping] = await Promise.all([
    prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, companyId: true, price: true, categoryId: true, subCategoryId: true },
    }),
    prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }),
    prisma.company.findUnique({ where: { id: dto.companyId }, select: { id: true } }),
    prisma.companyVendor.findUnique({
      where: { companyId_vendorId: { companyId: dto.companyId, vendorId: dto.vendorId } },
      select: { id: true, isActive: true },
    }),
  ]);

  if (!product) throw new AppError(404, "Product not found");
  if (!vendor) throw new AppError(404, "Vendor not found");
  if (!company) throw new AppError(404, "Company not found");
  if (!mapping || !mapping.isActive) throw new AppError(400, "Vendor is not active for this company");
  if (product.companyId && product.companyId !== dto.companyId) {
    throw new AppError(400, "Product is linked to a different company");
  }

  const duplicate = await prisma.rateEntry.findFirst({
    where: {
      productId: dto.productId,
      vendorId: dto.vendorId,
      companyId: dto.companyId,
      effectiveDate: dto.effectiveDate,
      billNo: dto.billNo ?? null,
    },
    select: { id: true },
  });
  if (duplicate) throw new AppError(409, "A rate entry already exists for this product, vendor, company, date, and bill number");

  return prisma.$transaction(async (tx) => {
    const latestForPair = await tx.rateEntry.findFirst({
      where: {
        productId: dto.productId,
        vendorId: dto.vendorId,
        companyId: dto.companyId,
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      select: { rate: true },
    });

    const entry = await tx.rateEntry.create({
      data: {
        ...dto,
        previousRate: latestForPair?.rate ?? product.price,
      },
      include: rateEntryInclude,
    });

    const currentLink = await tx.productVendor.findUnique({
      where: { productId_vendorId: { productId: dto.productId, vendorId: dto.vendorId } },
      select: { isActive: true, stock: true },
    });

    if (currentLink) {
      await tx.productVendor.update({
        where: { productId_vendorId: { productId: dto.productId, vendorId: dto.vendorId } },
        data: { price: dto.rate },
      });
    } else {
      await tx.productVendor.create({
        data: {
          productId: dto.productId,
          vendorId: dto.vendorId,
          price: dto.rate,
          stock: 0,
          isActive: false,
        },
      });
    }

    const shouldUpdateProduct = !product.companyId || product.companyId === dto.companyId;
    if (shouldUpdateProduct) {
      const activeLink = currentLink?.isActive ?? false;
      await tx.product.update({
        where: { id: dto.productId },
        data: {
          ...(activeLink && { price: dto.rate }),
          ...(!product.companyId && { companyId: dto.companyId }),
        },
      });
    }

    return entry;
  });
}
