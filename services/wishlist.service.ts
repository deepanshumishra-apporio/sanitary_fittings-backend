import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { AddToWishlistDto } from "../validations/wishlist.validation";

const wishlistInclude = {
  product: {
    select: { id: true, name: true, price: true, images: true, stock: true, category: { select: { id: true, name: true } } },
  },
};

export async function getWishlist(userId: string) {
  const items = await prisma.wishlist.findMany({
    where: { userId },
    include: wishlistInclude,
    orderBy: { createdAt: "desc" },
  });
  return items;
}

export async function addToWishlist(userId: string, dto: AddToWishlistDto) {
  const product = await prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true } });
  if (!product) throw new AppError(404, "Product not found");

  const exists = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId, productId: dto.productId } },
  });
  if (exists) throw new AppError(409, "Product already in wishlist");

  return prisma.wishlist.create({
    data: { userId, productId: dto.productId },
    include: wishlistInclude,
  });
}

export async function removeFromWishlist(userId: string, productId: string) {
  const item = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (!item) throw new AppError(404, "Item not in wishlist");
  await prisma.wishlist.delete({ where: { userId_productId: { userId, productId } } });
}

export async function clearWishlist(userId: string) {
  await prisma.wishlist.deleteMany({ where: { userId } });
}
