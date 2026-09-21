import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";

export type SupermarketContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  businessUnitId: string;
  userId: string;
};

export class SupermarketError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAUTHORIZED"
      | "NOT_CONFIGURED"
      | "NOT_FOUND"
      | "VALIDATION"
      | "CONFLICT"
      | "DATABASE"
      | "PRIVILEGE" = "DATABASE",
  ) {
    super(message);
    this.name = "SupermarketError";
  }
}

export type SupermarketFailurePhase = "auth" | "rls" | "query" | "transform" | "unknown";

export type SupermarketFailureLog = {
  route?: string;
  operation: string;
  phase?: SupermarketFailurePhase;
  code?: string;
  message?: string;
};

/**
 * Structured server log for supermarket failures (Vercel/runtime logs).
 * Never logs credentials, service-role keys, or full SQL payloads.
 */
export function logSupermarketFailure(meta: SupermarketFailureLog, error?: unknown) {
  const supermarketError = error instanceof SupermarketError ? error : null;
  const rawMessage =
    supermarketError?.message ??
    (error instanceof Error ? error.message : meta.message) ??
    "unknown";
  const sanitized = sanitizeLogMessage(rawMessage);
  const code =
    meta.code ??
    supermarketError?.code ??
    (typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : undefined) ??
    undefined;

  const phase =
    meta.phase ??
    (supermarketError?.code === "UNAUTHORIZED" || supermarketError?.code === "NOT_CONFIGURED"
      ? "auth"
      : supermarketError?.code === "PRIVILEGE"
        ? "rls"
        : supermarketError?.code === "DATABASE"
          ? "query"
          : "unknown");

  console.error(
    JSON.stringify({
      scope: "supermarket",
      route: meta.route ?? null,
      operation: meta.operation,
      phase,
      code: code || null,
      message: sanitized,
    }),
  );
}

function sanitizeLogMessage(message: string) {
  return message
    .replace(/service[_-]?role[^\s]*/gi, "[redacted]")
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted-jwt]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 400);
}

/** Process-local cache — supermarket is a single BU code per deployment. */
let cachedSupermarketBuId: string | null = null;

/**
 * Request-scoped supermarket context (React cache).
 * App-level auth first; RLS remains the data boundary.
 */
export const requireSupermarketContext = cache(async (): Promise<SupermarketContext> => {
  const user = await requireAuth();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new SupermarketError("Supabase is not configured.", "NOT_CONFIGURED");
  }

  let businessUnitId = cachedSupermarketBuId;
  if (!businessUnitId) {
    const { data: bu, error: buError } = await supabase
      .from("business_units")
      .select("id")
      .eq("code", "supermarket")
      .maybeSingle();

    if (buError) {
      throw new SupermarketError(classifyDbMessage(buError.message, buError.code), "DATABASE");
    }
    if (!bu?.id) {
      throw new SupermarketError("Supermarket business unit was not found.", "NOT_FOUND");
    }
    cachedSupermarketBuId = bu.id as string;
    businessUnitId = bu.id as string;
  }

  const isOwner =
    user.modules.includes("*") || user.roleCode === "SUPER_ADMIN" || user.roleCode === "OWNER";
  const hasModule =
    isOwner ||
    user.modules.includes("supermarket") ||
    user.businessUnits.some((unit: { code: string }) => unit.code === "supermarket");

  if (!hasModule) {
    throw new SupermarketError("You do not have access to Supermarket.", "UNAUTHORIZED");
  }

  return {
    supabase,
    businessUnitId,
    userId: user.id,
  };
});

function classifyDbMessage(message: string, code?: string): string {
  const lower = message.toLowerCase();
  if (
    code === "42501" ||
    lower.includes("permission denied for table") ||
    lower.includes("permission denied for relation")
  ) {
    return (
      "Database privileges for supermarket tables are missing. " +
      "Apply migration 20260921140000_supermarket_stable_access.sql in Supabase."
    );
  }
  return message || "Database operation failed.";
}

export function mapDbError(error: { message: string; code?: string } | null): never {
  if (!error) {
    throw new SupermarketError("Unexpected database error.", "DATABASE");
  }
  const message = classifyDbMessage(error.message, error.code);
  if (error.message.includes("duplicate") || error.code === "23505") {
    throw new SupermarketError(error.message.replace(/^.*?:\s*/, "") || "Duplicate record.", "CONFLICT");
  }
  if (
    error.message.includes("Insufficient stock") ||
    error.message.includes("Cannot return") ||
    error.message.includes("Cannot receive")
  ) {
    throw new SupermarketError(error.message, "VALIDATION");
  }
  if (error.code === "42501" || error.message.toLowerCase().includes("permission denied")) {
    throw new SupermarketError(message, "PRIVILEGE");
  }
  throw new SupermarketError(message, "DATABASE");
}

/**
 * Convert caught action errors into a user-safe message.
 * Always rethrows Next.js navigation control-flow errors first so soft-nav
 * redirects are not swallowed into `{ ok: false }`.
 */
export function actionErrorMessage(error: unknown, meta?: SupermarketFailureLog): string {
  unstable_rethrow(error);
  const shouldLog =
    !(error instanceof SupermarketError) ||
    error.code === "DATABASE" ||
    error.code === "PRIVILEGE" ||
    error.code === "NOT_CONFIGURED" ||
    error.code === "UNAUTHORIZED" ||
    error.code === "NOT_FOUND";
  if (shouldLog) {
    logSupermarketFailure(meta ?? { operation: "supermarket.action", phase: "unknown" }, error);
  }
  if (error instanceof SupermarketError) return error.message;
  if (error instanceof Error) return sanitizeLogMessage(error.message);
  return "Something went wrong. Please try again.";
}

/** True when a PostgREST/Postgres error is a privilege failure (not empty data). */
export function isPrivilegeError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const lower = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42501" ||
    lower.includes("permission denied for table") ||
    lower.includes("permission denied for relation")
  );
}

/**
 * Module access + fine-grained permission (existing catalog matchers).
 * Throws UNAUTHORIZED — actions return `{ ok: false }` instead of redirecting.
 */
export async function requireSupermarketPermission(permission: string): Promise<SupermarketContext> {
  const ctx = await requireSupermarketContext();
  const user = await requireAuth();

  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return ctx;
  }

  const allowed = user.permissions.some((matcher) => matchPermission(permission, matcher));
  if (!allowed) {
    throw new SupermarketError("You do not have permission for this action.", "UNAUTHORIZED");
  }

  return ctx;
}
