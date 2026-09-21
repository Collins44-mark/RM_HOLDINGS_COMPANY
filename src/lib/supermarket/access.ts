import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";

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

export function actionErrorMessage(error: unknown): string {
  if (error instanceof SupermarketError) return error.message;
  if (error instanceof Error) return error.message;
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
