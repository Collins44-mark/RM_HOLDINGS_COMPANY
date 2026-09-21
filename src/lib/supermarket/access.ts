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
      | "DATABASE" = "DATABASE",
  ) {
    super(message);
    this.name = "SupermarketError";
  }
}

export async function requireSupermarketContext(): Promise<SupermarketContext> {
  const user = await requireAuth();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new SupermarketError("Supabase is not configured.", "NOT_CONFIGURED");
  }

  const { data: bu, error: buError } = await supabase
    .from("business_units")
    .select("id")
    .eq("code", "supermarket")
    .maybeSingle();

  if (buError) {
    throw new SupermarketError(buError.message, "DATABASE");
  }
  if (!bu?.id) {
    throw new SupermarketError("Supermarket business unit was not found.", "NOT_FOUND");
  }

  const isOwner = user.modules.includes("*") || user.roleCode === "SUPER_ADMIN" || user.roleCode === "OWNER";
  const hasModule =
    isOwner ||
    user.modules.includes("supermarket") ||
    user.businessUnits.some((unit: { code: string }) => unit.code === "supermarket");

  if (!hasModule) {
    throw new SupermarketError("You do not have access to Supermarket.", "UNAUTHORIZED");
  }

  return {
    supabase,
    businessUnitId: bu.id,
    userId: user.id,
  };
}

export function mapDbError(error: { message: string; code?: string } | null): never {
  if (!error) {
    throw new SupermarketError("Unexpected database error.", "DATABASE");
  }
  const message = error.message || "Database operation failed.";
  if (message.includes("duplicate") || error.code === "23505") {
    throw new SupermarketError(message.replace(/^.*?:\s*/, "") || "Duplicate record.", "CONFLICT");
  }
  if (message.includes("Insufficient stock") || message.includes("Cannot return") || message.includes("Cannot receive")) {
    throw new SupermarketError(message, "VALIDATION");
  }
  throw new SupermarketError(message, "DATABASE");
}

export function actionErrorMessage(error: unknown): string {
  if (error instanceof SupermarketError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
