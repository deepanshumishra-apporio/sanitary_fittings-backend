import type { Prisma } from "../generated/prisma/client";

type CompanyVendorClient = Pick<Prisma.TransactionClient, "companyVendor">;

export async function ensureCompanyVendorLink(
  tx: CompanyVendorClient,
  companyId: string | null | undefined,
  vendorId: string
) {
  if (!companyId) return;

  await tx.companyVendor.upsert({
    where: { companyId_vendorId: { companyId, vendorId } },
    update: { isActive: true },
    create: { companyId, vendorId, isActive: true },
  });
}

export async function ensureCompanyVendorLinks(
  tx: CompanyVendorClient,
  companyId: string | null | undefined,
  vendorIds: string[]
) {
  const uniqueVendorIds = [...new Set(vendorIds)];
  await Promise.all(uniqueVendorIds.map((vendorId) => ensureCompanyVendorLink(tx, companyId, vendorId)));
}
