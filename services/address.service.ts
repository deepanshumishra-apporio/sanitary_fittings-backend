import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateAddressDto, UpdateAddressDto } from "../validations/address.validation";

async function assertOwner(addressId: string, userId: string) {
  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address) throw new AppError(404, "Address not found");
  if (address.userId !== userId) throw new AppError(403, "Forbidden");
  return address;
}

async function applyDefault(userId: string, newDefaultId: string) {
  await prisma.address.updateMany({
    where: { userId, isDefault: true, NOT: { id: newDefaultId } },
    data: { isDefault: false },
  });
}

export async function getAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function getAddressById(addressId: string, userId: string) {
  return assertOwner(addressId, userId);
}

export async function createAddress(userId: string, dto: CreateAddressDto) {
  const count = await prisma.address.count({ where: { userId } });
  if (count >= 10) throw new AppError(400, "Maximum of 10 addresses allowed");

  // Force first address to be default
  const isDefault = count === 0 ? true : dto.isDefault;

  const address = await prisma.address.create({ data: { ...dto, isDefault, userId } });
  if (address.isDefault) await applyDefault(userId, address.id);
  return address;
}

export async function updateAddress(addressId: string, userId: string, dto: UpdateAddressDto) {
  await assertOwner(addressId, userId);

  const address = await prisma.address.update({
    where: { id: addressId },
    data: dto,
  });

  if (address.isDefault) await applyDefault(userId, address.id);
  return address;
}

export async function setDefaultAddress(addressId: string, userId: string) {
  await assertOwner(addressId, userId);
  await applyDefault(userId, addressId);
  return prisma.address.update({ where: { id: addressId }, data: { isDefault: true } });
}

export async function deleteAddress(addressId: string, userId: string) {
  const address = await assertOwner(addressId, userId);

  await prisma.address.delete({ where: { id: addressId } });

  // Promote newest remaining address to default if deleted one was default
  if (address.isDefault) {
    const next = await prisma.address.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}
