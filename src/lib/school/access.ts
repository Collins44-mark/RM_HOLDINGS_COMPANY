import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";

export type SchoolContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  businessUnitId: string;
  userId: string;
};

export class SchoolError extends Error {
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
    this.name = "SchoolError";
  }
}

let cachedSchoolBuId: string | null = null;

export const requireSchoolContext = cache(async (): Promise<SchoolContext> => {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new SchoolError("Supabase is not configured.", "NOT_CONFIGURED");
  }

  let businessUnitId = cachedSchoolBuId;
  if (!businessUnitId) {
    const { data: bu, error } = await supabase.from("business_units").select("id").eq("code", "school").maybeSingle();
    if (error) throw new SchoolError("Couldn't load school settings.", "DATABASE");
    if (!bu?.id) throw new SchoolError("School business unit was not found.", "NOT_FOUND");
    cachedSchoolBuId = String(bu.id);
    businessUnitId = cachedSchoolBuId;
  }

  const isOwner = isOwnerRole(user.roleCode);
  const hasModule =
    isOwner || user.modules.includes("school") || user.businessUnits.some((unit: { code: string }) => unit.code === "school");
  if (!hasModule) {
    throw new SchoolError("You do not have access to School Management.", "UNAUTHORIZED");
  }

  return { supabase, businessUnitId, userId: user.id };
});

export function mapSchoolDbError(error: { message: string; code?: string } | null): never {
  if (!error) throw new SchoolError("Couldn't save school settings.", "DATABASE");
  if (error.code === "23505") {
    throw new SchoolError("That name or code is already in use.", "CONFLICT");
  }
  if (error.code === "23P01") {
    throw new SchoolError("Grading ranges cannot overlap.", "VALIDATION");
  }
  if (error.code === "23514") {
    throw new SchoolError("Check the dates, times, and amounts entered.", "VALIDATION");
  }
  if (error.code === "42501" || error.message.toLowerCase().includes("permission denied")) {
    throw new SchoolError("This action isn’t available.", "PRIVILEGE");
  }
  console.error(
    JSON.stringify({
      scope: "school",
      operation: "db",
      code: error.code ?? null,
      message: error.message.slice(0, 240),
    }),
  );
  throw new SchoolError("Couldn't save school settings.", "DATABASE");
}

export function schoolActionError(error: unknown): string {
  unstable_rethrow(error);
  if (error instanceof SchoolError) return error.message;
  console.error(JSON.stringify({ scope: "school", operation: "action", message: String(error).slice(0, 240) }));
  return "Something went wrong. Please try again.";
}

export async function requireSchoolPermission(permission: string): Promise<SchoolContext> {
  const ctx = await requireSchoolContext();
  const user = await requireAuth();
  if (isOwnerRole(user.roleCode)) return ctx;
  const allowed = user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
  if (!allowed) throw new SchoolError("This action isn’t available.", "UNAUTHORIZED");
  return ctx;
}
