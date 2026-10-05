import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVerifiedAuthUser } from "@/lib/auth/session";

export type AuditSeverity = "low" | "medium" | "high";

export type AuditActorSnapshot = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type WriteAuditEventInput = {
  action: string;
  module: string;
  description: string;
  severity: AuditSeverity;
  entityType?: string | null;
  entityId?: string | null;
  businessUnitId?: string | null;
  metadata?: Record<string, unknown>;
  /** Override when the session is not yet available (login/logout/unauthenticated). */
  actor?: AuditActorSnapshot;
};

const INTERNAL_EMAIL_SUFFIX = "@users.rmholdings.internal";

function safeEmail(value: string | null | undefined) {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!email || email.endsWith(INTERNAL_EMAIL_SUFFIX)) return null;
  return email.slice(0, 160);
}

function safeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};
  const blocked = /password|secret|token|key|authorization|cookie|hash/i;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.test(key)) continue;
    if (value == null) continue;
    if (typeof value === "string") {
      next[key] = value.slice(0, 240);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      next[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      next[key] = value.slice(0, 20);
    }
  }
  return next;
}

async function requestContext() {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null;
    return {
      ipAddress: ip ? ip.slice(0, 80) : null,
      userAgent: h.get("user-agent")?.slice(0, 240) ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Server-side append-only audit writer. Uses the service-role client.
 * Never throws to callers; logs persistence failures instead.
 */
export async function writeAuditEvent(input: WriteAuditEventInput): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error(JSON.stringify({ scope: "audit", message: "Admin client unavailable; event not stored." }));
    return;
  }

  let actor = input.actor;
  if (!actor) {
    const user = await getVerifiedAuthUser();
    if (user) {
      actor = { id: user.id, name: user.name, email: user.email };
    }
  }

  const request = await requestContext();
  const { error } = await admin.from("audit_logs").insert({
    actor_user_id: actor?.id ?? null,
    actor_name: actor?.name?.trim() || (actor?.id ? null : "System / Unauthenticated"),
    actor_email: safeEmail(actor?.email),
    action: input.action.slice(0, 80),
    module: input.module.slice(0, 40),
    entity_type: input.entityType?.slice(0, 80) ?? null,
    entity_id: input.entityId?.slice(0, 80) ?? null,
    business_unit_id: input.businessUnitId ?? null,
    description: input.description.slice(0, 500),
    severity: input.severity,
    metadata: safeMetadata(input.metadata),
    ip_address: request.ipAddress,
    user_agent: request.userAgent,
  });

  if (error) {
    console.error(
      JSON.stringify({
        scope: "audit",
        operation: "writeAuditEvent",
        action: input.action,
        module: input.module,
        message: error.message,
      }),
    );
  }
}

export async function writeSupermarketAudit(
  businessUnitId: string,
  input: Omit<WriteAuditEventInput, "module" | "businessUnitId">,
) {
  await writeAuditEvent({ ...input, module: "supermarket", businessUnitId });
}
