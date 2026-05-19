import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateCategoryDto, UpdateCategoryDto } from "../validations/category.validation";

const categoryInclude = {
  parent: { select: { id: true, name: true } },
  children: { select: { id: true, name: true, description: true } },
  _count: { select: { products: true } },
};

export async function listCategories() {
  return prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: { select: { id: true, name: true, description: true } },
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getCategory(id: string) {
  const category = await prisma.category.findUnique({ where: { id }, include: categoryInclude });
  if (!category) throw new AppError(404, "Category not found");
  return category;
}

export async function createCategory(dto: CreateCategoryDto) {
  const exists = await prisma.category.findUnique({ where: { name: dto.name } });
  if (exists) throw new AppError(409, "Category with this name already exists");

  if (dto.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: dto.parentId } });
    if (!parent) throw new AppError(400, "Parent category not found");
  }

  return prisma.category.create({ data: dto, include: categoryInclude });
}

export async function updateCategory(id: string, dto: UpdateCategoryDto) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError(404, "Category not found");

  if (dto.name && dto.name !== category.name) {
    const exists = await prisma.category.findUnique({ where: { name: dto.name } });
    if (exists) throw new AppError(409, "Category with this name already exists");
  }

  if (dto.parentId) {
    if (dto.parentId === id) throw new AppError(400, "Category cannot be its own parent");
    const parent = await prisma.category.findUnique({ where: { id: dto.parentId } });
    if (!parent) throw new AppError(400, "Parent category not found");
  }

  return prisma.category.update({ where: { id }, data: dto, include: categoryInclude });
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!category) throw new AppError(404, "Category not found");
  if (category._count.products > 0)
    throw new AppError(409, "Cannot delete a category that has products assigned to it");
  if (category._count.children > 0)
    throw new AppError(409, "Cannot delete a category that has subcategories");

  await prisma.category.delete({ where: { id } });
}
