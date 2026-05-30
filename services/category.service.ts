import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateCategoryDto, UpdateCategoryDto } from "../validations/category.validation";

const categoryInclude = {
  _count: { select: { products: true } },
};

export async function listCategories() {
  return prisma.category.findMany({
    include: categoryInclude,
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

  return prisma.category.create({ data: dto, include: categoryInclude });
}

export async function updateCategory(id: string, dto: UpdateCategoryDto) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError(404, "Category not found");

  if (dto.name && dto.name !== category.name) {
    const exists = await prisma.category.findUnique({ where: { name: dto.name } });
    if (exists) throw new AppError(409, "Category with this name already exists");
  }

  return prisma.category.update({ where: { id }, data: dto, include: categoryInclude });
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw new AppError(404, "Category not found");
  if (category._count.products > 0)
    throw new AppError(409, "Cannot delete a category that has products assigned to it");

  await prisma.category.delete({ where: { id } });
}
