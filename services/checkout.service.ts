import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CheckoutDto } from "../validations/checkout.validation";

const cartProductSelect = {
  id: true,
  name: true,
  price: true,
  discount: true,
  images: true,
  stock: true,
};

export async function previewCheckout(userId: string) {
  const [cartItems, addresses] = await Promise.all([
    prisma.cart.findMany({
      where: { userId },
      include: { product: { select: cartProductSelect } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (cartItems.length === 0) throw new AppError(400, "Cart is empty");

  const lines = cartItems.map((item) => ({
    cartItemId: item.id,
    product: item.product,
    quantity: item.quantity,
    unitPrice: item.product.price,
    unitDiscount: Math.min(item.product.discount, item.product.price),
    discountedUnitPrice: +(Math.max(0, item.product.price - item.product.discount).toFixed(2)),
    lineTotal: +(Math.max(0, item.product.price - item.product.discount) * item.quantity).toFixed(2),
    available: item.product.stock >= item.quantity,
    maxQuantity: item.product.stock,
  }));

  const subtotal = +(lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
  const hasUnavailableItems = lines.some((l) => !l.available);

  return { lines, subtotal, addresses, hasUnavailableItems };
}

export async function confirmCheckout(userId: string, dto: CheckoutDto) {
  const address = await prisma.address.findUnique({ where: { id: dto.addressId } });
  if (!address) throw new AppError(400, "Address not found");
  if (address.userId !== userId) throw new AppError(403, "Forbidden");

  const cartItems = await prisma.cart.findMany({
    where: { userId },
    include: { product: { select: { id: true, name: true, price: true, discount: true, stock: true } } },
  });

  if (cartItems.length === 0) throw new AppError(400, "Cart is empty");

  for (const item of cartItems) {
    if (item.product.stock < item.quantity)
      throw new AppError(400, `Insufficient stock for "${item.product.name}"`);
  }

  const orderItems = cartItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    price: item.product.price,
    discount: Math.min(item.product.discount, item.product.price),
  }));

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = orderItems.reduce((s, i) => s + i.discount * i.quantity, 0);
  const totalPrice = +Math.max(0, subtotal - discount).toFixed(2);

  return prisma.$transaction(async (tx) => {
    for (const item of cartItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    const order = await tx.order.create({
      data: {
        userId,
        addressId: dto.addressId,
        totalPrice,
        discount,
        items: { create: orderItems },
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, price: true, images: true } } },
        },
        address: true,
      },
    });

    await tx.cart.deleteMany({ where: { userId } });

    return order;
  });
}
