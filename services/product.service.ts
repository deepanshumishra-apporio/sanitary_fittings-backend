import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateProductDto, UpdateProductDto, ProductQuery } from "../validations/product.validation";

const categorySelect = { id: true, name: true };
const subCategorySelect = { id: true, name: true, categoryId: true };
const companySelect = { id: true, name: true };
const productInclude = {
  category: { select: categorySelect },
  subCategory: { select: subCategorySelect },
  company: { select: companySelect },
};

export async function listProducts(query: ProductQuery) {
  const { page, limit, search, category, subCategory, company, minPrice, maxPrice, sortBy, order } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(category && { categoryId: category }),
    ...(subCategory && { subCategoryId: subCategory }),
    ...(company && { companyId: company }),
    ...((minPrice !== undefined || maxPrice !== undefined) && {
      price: {
        ...(minPrice !== undefined && { gte: minPrice }),
        ...(maxPrice !== undefined && { lte: maxPrice }),
      },
    }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { [sortBy]: order },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productInclude,
  });
  if (!product) throw new AppError(404, "Product not found");
  return product;
}

export async function listByCategory(categoryId: string, page: number, limit: number) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw new AppError(404, "Category not found");

  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { categoryId },
      include: productInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where: { categoryId } }),
  ]);

  return {
    data: products,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

export async function createProduct(dto: CreateProductDto) {
  const { vendors = [], ...productData } = dto;

  // ── Pre-flight validation (fast-fail before opening a transaction) ────────
  const category = await prisma.category.findUnique({
    where: { id: dto.categoryId },
    select: { id: true },
  });
  if (!category) throw new AppError(400, "Category not found");

  if (dto.subCategoryId !== undefined && dto.subCategoryId !== null) {
    const subCategory = await prisma.subCategory.findUnique({
      where: { id: dto.subCategoryId },
      select: { id: true, categoryId: true },
    });
    if (!subCategory) throw new AppError(400, "Sub category not found");
    if (subCategory.categoryId !== dto.categoryId) {
      throw new AppError(400, "Sub category does not belong to the selected category");
    }
  }

  if (dto.companyId !== undefined && dto.companyId !== null) {
    const company = await prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true },
    });
    if (!company) throw new AppError(400, "Company not found");
  }

  if (vendors.length > 0) {
    const vendorIds = vendors.map((v) => v.vendorId);

    if (new Set(vendorIds).size !== vendorIds.length) {
      throw new AppError(400, "Duplicate vendors in list");
    }

    const found = await prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true },
    });
    if (found.length !== vendorIds.length) {
      throw new AppError(400, "One or more vendors not found");
    }
  }

  // ── Transaction: product row + all vendor pivot rows atomically ───────────
  const activeVendor = vendors[0];

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...productData,
        // Active vendor drives the denormalised price/stock on the product row
        ...(activeVendor && {
          price: activeVendor.price,
          stock: activeVendor.stock,
        }),
      },
      include: productInclude,
    });

    if (vendors.length > 0) {
      await tx.productVendor.createMany({
        data: vendors.map((v, i) => ({
          productId: product.id,
          vendorId: v.vendorId,
          price: v.price,
          stock: v.stock,
          sku: v.sku,
          isActive: i === 0,
        })),
      });
    }

    return product;
  });
}

export async function updateProduct(id: string, dto: UpdateProductDto) {
  const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "Product not found");

  if (dto.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) throw new AppError(400, "Category not found");
  }

  if (dto.subCategoryId !== undefined && dto.subCategoryId !== null) {
    const subCategory = await prisma.subCategory.findUnique({
      where: { id: dto.subCategoryId },
      select: { id: true, categoryId: true },
    });
    if (!subCategory) throw new AppError(400, "Sub category not found");

    const effectiveCategoryId = dto.categoryId ?? (await prisma.product.findUnique({
      where: { id },
      select: { categoryId: true },
    }))?.categoryId;

    if (!effectiveCategoryId || subCategory.categoryId !== effectiveCategoryId) {
      throw new AppError(400, "Sub category does not belong to the selected category");
    }
  }

  if (dto.companyId !== undefined && dto.companyId !== null) {
    const company = await prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true },
    });
    if (!company) throw new AppError(400, "Company not found");
  }

  return prisma.product.update({
    where: { id },
    data: dto,
    include: productInclude,
  });
}

export async function deleteProduct(id: string) {
  const exists = await prisma.product.findUnique({
    where: { id },
    select: { id: true, _count: { select: { orderItems: true } } },
  });
  if (!exists) throw new AppError(404, "Product not found");
  if (exists._count.orderItems > 0) {
    throw new AppError(409, "Product has existing orders and cannot be deleted");
  }
  await prisma.product.delete({ where: { id } });
}
