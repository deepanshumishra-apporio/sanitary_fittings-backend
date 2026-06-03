import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateRateEntryDto, RateEntryQueryDto } from "../validations/rate-entry.validation";
import { ensureCompanyVendorLink } from "./company-vendor-link.service";

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

const productVendorRateInclude = {
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
  vendor: { select: { id: true, name: true, email: true, phone: true } },
};

const productRateInclude = {
  category: { select: { id: true, name: true } },
  subCategory: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
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

  if (latestOnly) {
    const companyVendorWhere = {
      ...(companyId && { companyId }),
      ...(vendorId && { vendorId }),
    };
    const companyVendorLinks = await prisma.companyVendor.findMany({
      where: companyVendorWhere,
      include: { company: { select: { id: true, name: true } } },
    });
    const companyByVendorId = new Map(companyVendorLinks.map((link) => [link.vendorId, link.company]));
    const vendorIdsForCompany = companyId ? companyVendorLinks.map((link) => link.vendorId) : undefined;
    const productVendorWhere = {
      ...(vendorId && { vendorId }),
      ...(vendorIdsForCompany && { vendorId: { in: vendorIdsForCompany } }),
      product: {
        ...(companyId && { OR: [{ companyId }, { companyId: null }] }),
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

    const productWhere = {
      ...(companyId && { companyId }),
      ...(categoryId && { categoryId }),
      ...(subCategoryId && { subCategoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      vendors: { none: {} },
    };

    const [productVendorTotal, productFallbackTotal, latestRows] = await Promise.all([
      prisma.productVendor.count({ where: productVendorWhere }),
      vendorId ? Promise.resolve(0) : prisma.product.count({ where: productWhere }),
      prisma.rateEntry.findMany({
        where,
        distinct: ["productId", "vendorId", "companyId"],
        include: rateEntryInclude,
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const remainingAfterVendors = Math.max(0, limit - Math.max(0, productVendorTotal - skip));
    const productVendorTake = skip >= productVendorTotal ? 0 : Math.min(limit, productVendorTotal - skip);
    const productFallbackSkip = Math.max(0, skip - productVendorTotal);

    const [productVendors, fallbackProducts] = await Promise.all([
      prisma.productVendor.findMany({
        where: productVendorWhere,
        include: productVendorRateInclude,
        orderBy: [{ product: { name: "asc" } }, { vendor: { name: "asc" } }],
        skip: Math.min(skip, productVendorTotal),
        take: productVendorTake,
      }),
      remainingAfterVendors > 0 && !vendorId
        ? prisma.product.findMany({
            where: productWhere,
            include: productRateInclude,
            orderBy: { name: "asc" },
            skip: productFallbackSkip,
            take: remainingAfterVendors,
          })
        : Promise.resolve([]),
    ]);

    const total = productVendorTotal + productFallbackTotal;

    const fallbackProductRows = fallbackProducts.map((product) => {
      const company = product.company ?? { id: "unassigned", name: "Unassigned" };
      return {
        billNo: null,
        company,
        companyId: company.id,
        effectiveDate: product.updatedAt,
        id: `product-price-${product.id}`,
        notes: null,
        previousRate: null,
        product: {
          category: product.category,
          categoryId: product.categoryId,
          company: product.company,
          companyId: product.companyId,
          id: product.id,
          name: product.name,
          subCategory: product.subCategory,
          subCategoryId: product.subCategoryId,
        },
        productId: product.id,
        rate: product.price,
        vendor: { email: null, id: "product-price", name: "Product Price", phone: null },
        vendorId: "product-price",
      };
    });

    const latestByPair = new Map(
      latestRows.map((entry) => [`${entry.productId}:${entry.vendorId}:${entry.companyId}`, entry])
    );

    const data = productVendors
      .map((entry) => {
        const productCompany = entry.product.company ?? companyByVendorId.get(entry.vendorId) ?? { id: "unassigned", name: "Unassigned" };
        const fallbackCompanyId = productCompany.id;
        const latest = latestByPair.get(`${entry.productId}:${entry.vendorId}:${fallbackCompanyId}`);
        return {
          billNo: latest?.billNo ?? null,
          company: latest?.company ?? productCompany,
          companyId: latest?.companyId ?? fallbackCompanyId,
          effectiveDate: latest?.effectiveDate ?? entry.updatedAt,
          id: latest?.id ?? `product-vendor-${entry.id}`,
          notes: latest?.notes ?? null,
          previousRate: latest?.previousRate ?? null,
          product: latest?.product ?? entry.product,
          productId: entry.productId,
          rate: entry.price,
          vendor: latest?.vendor ?? entry.vendor,
          vendorId: entry.vendorId,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    data.push(...fallbackProductRows);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  const [rows, totalHistory] = await Promise.all([
    prisma.rateEntry.findMany({
      where,
      include: rateEntryInclude,
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.rateEntry.count({ where }),
  ]);

  const total = totalHistory;

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
  if (mapping && !mapping.isActive) throw new AppError(400, "Vendor is not active for this company");
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
    if (!mapping) {
      await ensureCompanyVendorLink(tx, dto.companyId, dto.vendorId);
    }

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
