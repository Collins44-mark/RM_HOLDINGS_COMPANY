import { NextResponse } from "next/server";
import { writeAuditEvent, type AuditSeverity } from "@/lib/audit";

export async function auditedBeeResponse(
  businessUnitId: string,
  body: unknown,
  event: {
    action: string;
    description: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    severity?: AuditSeverity;
  },
) {
  await writeAuditEvent({
    action: event.action,
    module: "beekeeping",
    description: event.description,
    severity: event.severity ?? "medium",
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    businessUnitId,
    metadata: event.metadata,
  });
  return NextResponse.json(body);
}
