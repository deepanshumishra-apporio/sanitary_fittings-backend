import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateOrderDto, UpdateOrderStatusDto, ManualOrderDto } from "../validations/order.validation";

const orderInclude = {
  items: {
    include: { product: { select: { id: true, name: true, price: true, discount: true, images: true } } },
  },
  address: true,
  payment: {
    select: {
      id: true,
      amount: true,
      status: true,
      method: true,
      razorpayOrderId: true,
      transactionId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
};

export async function getMyOrders(userId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: { userId } }),
  ]);
  return { data: orders, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function getMyOrderById(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw new AppError(404, "Order not found");
  if (order.userId !== userId) throw new AppError(403, "Forbidden");
  return order;
}

export async function getAllOrders(
  page: number,
  limit: number,
  status?: string,
  from?: Date,
  to?: Date
) {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;
  if (from || to) where["createdAt"] = { ...(from && { gte: from }), ...(to && { lte: to }) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);
  return { data: orders, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function getOrderById(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
  return order;
}

export async function createOrder(userId: string, dto: CreateOrderDto) {
  const address = await prisma.address.findUnique({ where: { id: dto.addressId } });
  if (!address) throw new AppError(400, "Address not found");
  if (address.userId !== userId) throw new AppError(403, "Forbidden");

  const productIds = dto.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, price: true, discount: true, stock: true },
  });

  if (products.length !== productIds.length) throw new AppError(400, "One or more products not found");

  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of dto.items) {
    const product = productMap.get(item.productId)!;
    if (product.stock < item.quantity)
      throw new AppError(400, `Insufficient stock for "${product.name}"`);
  }

  const orderItems = dto.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    price: productMap.get(item.productId)!.price,
    discount: Math.min(productMap.get(item.productId)!.discount, productMap.get(item.productId)!.price),
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = orderItems.reduce((sum, i) => sum + i.discount * i.quantity, 0);
  const totalPrice = Math.max(0, subtotal - discount);

  return prisma.$transaction(async (tx) => {
    for (const item of dto.items) {
      // Deduct product stock
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
      // Deduct active vendor stock
      await tx.productVendor.updateMany({
        where: { productId: item.productId, isActive: true },
        data: { stock: { decrement: item.quantity } },
      });
    }
    return tx.order.create({
      data: { userId, addressId: dto.addressId, totalPrice, discount, items: { create: orderItems } },
      include: orderInclude,
    });
  });
}

export async function updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw new AppError(404, "Order not found");

  return prisma.order.update({ where: { id: orderId }, data: { status: dto.status }, include: orderInclude });
}

export async function createManualOrder(dto: ManualOrderDto) {
  // 1. Resolve or create user
  let targetUserId: string;

  if (dto.userId) {
    const user = await prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } });
    if (!user) throw new AppError(404, "User not found");
    targetUserId = user.id;
  } else {
    const email = dto.customerEmail!;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      targetUserId = existing.id;
      // Fill in profile fields if they aren't set yet
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(dto.customerName && { name: dto.customerName }),
          ...(dto.customerPhone && { phone: dto.customerPhone }),
        },
      });
    } else {
      const created = await prisma.user.create({
        data: {
          email,
          name: dto.customerName ?? null,
          phone: dto.customerPhone ?? null,
          role: "CUSTOMER",
          emailVerified: false,
        },
        select: { id: true },
      });
      targetUserId = created.id;
    }
  }

  // 2. Create a fresh delivery address linked to the resolved user (optional)
  const addrDto = dto.address;
  const address = addrDto
    ? await prisma.address.create({
        data: {
          userId: targetUserId,
          name: addrDto.name,
          phone: addrDto.phone ?? null,
          line1: addrDto.line1,
          line2: addrDto.line2 ?? null,
          city: addrDto.city,
          state: addrDto.state,
          zip: addrDto.zip,
          country: addrDto.country,
          isDefault: false,
        },
      })
    : null;

  // 3. Validate products exist and have enough stock
  const productIds = dto.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, price: true, discount: true, stock: true },
  });

  if (products.length !== productIds.length)
    throw new AppError(400, "One or more products not found");

  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of dto.items) {
    const product = productMap.get(item.productId)!;
    if (product.stock < item.quantity)
      throw new AppError(400, `Insufficient stock for "${product.name}"`);
  }

  const orderItems = dto.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    price: productMap.get(item.productId)!.price,
    discount: Math.min(productMap.get(item.productId)!.discount, productMap.get(item.productId)!.price),
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountAmount = orderItems.reduce((sum, i) => sum + i.discount * i.quantity, 0);
  const totalPrice = Math.max(0, subtotal - discountAmount);

  // 4. Deduct stock and create order in a single transaction
  return prisma.$transaction(async (tx) => {
    for (const item of dto.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
      await tx.productVendor.updateMany({
        where: { productId: item.productId, isActive: true },
        data: { stock: { decrement: item.quantity } },
      });
    }
    return tx.order.create({
      data: {
        userId: targetUserId,
        ...(address && { addressId: address.id }),
        totalPrice,
        discount: discountAmount,
        status: "CONFIRMED",
        items: { create: orderItems },
      },
      include: {
        ...orderInclude,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

export async function cancelOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.userId !== userId) throw new AppError(403, "Forbidden");

  const cancellable = ["PENDING", "CONFIRMED"];
  if (!cancellable.includes(order.status)) throw new AppError(400, `Cannot cancel a ${order.status} order`);

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // Restore product stock
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
      // Restore active vendor stock
      await tx.productVendor.updateMany({
        where: { productId: item.productId, isActive: true },
        data: { stock: { increment: item.quantity } },
      });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  });
}
