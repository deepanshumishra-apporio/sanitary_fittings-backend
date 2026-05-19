import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { AddToCartDto, UpdateCartDto } from "../validations/cart.validation";

const cartInclude = {
  product: { select: { id: true, name: true, price: true, discount: true, images: true, stock: true } },
};

export async function getCart(userId: string) {
  const items = await prisma.cart.findMany({
    where: { userId },
    include: cartInclude,
    orderBy: { createdAt: "asc" },
  });

  const total = items.reduce((sum, i) => sum + Math.max(0, i.product.price - i.product.discount) * i.quantity, 0);
  return { items, total };
}

export async function addToCart(userId: string, dto: AddToCartDto) {
  const product = await prisma.product.findUnique({
    where: { id: dto.productId },
    select: { id: true, stock: true, price: true, discount: true },
  });
  if (!product) throw new AppError(404, "Product not found");
  if (product.discount > product.price) throw new AppError(400, "Product discount is invalid");
  if (product.stock < dto.quantity) throw new AppError(400, "Insufficient stock");

  const existing = await prisma.cart.findUnique({
    where: { userId_productId: { userId, productId: dto.productId } },
  });

  const newQty = (existing?.quantity ?? 0) + dto.quantity;
  if (product.stock < newQty) throw new AppError(400, "Insufficient stock");

  return prisma.cart.upsert({
    where: { userId_productId: { userId, productId: dto.productId } },
    create: { userId, productId: dto.productId, quantity: dto.quantity },
    update: { quantity: newQty },
    include: cartInclude,
  });
}

export async function updateCartItem(userId: string, productId: string, dto: UpdateCartDto) {
  const item = await prisma.cart.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (!item) throw new AppError(404, "Cart item not found");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true },
  });
  if (!product || product.stock < dto.quantity) throw new AppError(400, "Insufficient stock");

  return prisma.cart.update({
    where: { userId_productId: { userId, productId } },
    data: { quantity: dto.quantity },
    include: cartInclude,
  });
}

export async function removeCartItem(userId: string, productId: string) {
  const item = await prisma.cart.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (!item) throw new AppError(404, "Cart item not found");
  await prisma.cart.delete({ where: { userId_productId: { userId, productId } } });
}

export async function clearCart(userId: string) {
  await prisma.cart.deleteMany({ where: { userId } });
}
