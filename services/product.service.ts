import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateProductDto, UpdateProductDto, ProductQuery } from "../validations/product.validation";

const categorySelect = { id: true, name: true };
const productInclude = { category: { select: categorySelect } };

export async function listProducts(query: ProductQuery) {
  const { page, limit, search, category, minPrice, maxPrice, sortBy, order } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(category && { categoryId: category }),
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
  const category = await prisma.category.findUnique({
    where: { id: dto.categoryId },
    select: { id: true },
  });
  if (!category) throw new AppError(400, "Category not found");

  return prisma.product.create({ data: dto, include: productInclude });
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

  // discount is a percentage, just validate 0-100 (Zod already does this)

  // Never overwrite stock — it's owned by ProductVendor
  const { stock, ...safeDto } = dto as any;

  return prisma.product.update({
    where: { id },
    data: safeDto,
    include: productInclude,
  });
}

export async function deleteProduct(id: string) {
  const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "Product not found");
  await prisma.product.delete({ where: { id } });
}
