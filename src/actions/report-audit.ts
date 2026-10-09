"use server";

import { z } from "zod";
import { getVerifiedAuthUser } from "@/lib/auth/session";
import { writeAuditEvent } from "@/lib/audit";

const schema = z.object({
  kind: z.enum([
    "sales",
    "inventory",
    "purchases",
    "profit-loss",
    "school-finance",
    "school-admissions",
    "school-students",
    "school-parents",
    "school-transport",
  ]),
  period: z.string().max(80).optional(),
});

export async function recordReportExportAction(input: {
  kind:
    | "sales"
    | "inventory"
    | "purchases"
    | "profit-loss"
    | "school-finance"
    | "school-admissions"
    | "school-students"
    | "school-parents"
    | "school-transport";
  period?: string;
}) {
  const user = await getVerifiedAuthUser();
  if (!user) return;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return;

  await writeAuditEvent({
    action: "report.exported",
    module: "reports",
    entityType: "report",
    entityId: parsed.data.kind,
    description: `Exported ${parsed.data.kind} report${parsed.data.period ? ` (${parsed.data.period})` : ""}`,
    severity: "low",
    metadata: { report: parsed.data.kind, period: parsed.data.period ?? "" },
    businessUnitId: null,
  });
}
