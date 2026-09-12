import { prisma } from "@/lib/db";

export async function writeAuditLog(input: {
  userId?: string | null;
  action: string;
  module: string;
  description: string;
  recordType?: string;
  recordId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      module: input.module,
      description: input.description,
      recordType: input.recordType,
      recordId: input.recordId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
