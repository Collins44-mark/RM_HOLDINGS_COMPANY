import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { getBusinessUnitByCode } from "@/lib/data/business-units";

export type RiceContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  businessUnitId: string;
  userId: string;
};

export class RiceError extends Error {
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
    this.name = "RiceError";
  }
}

let cachedRiceBuId: string | null = null;

export const requireRiceContext = cache(async (): Promise<RiceContext> => {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new RiceError("Supabase is not configured.", "NOT_CONFIGURED");
  }

  let businessUnitId = cachedRiceBuId;
  if (!businessUnitId) {
    const unit = await getBusinessUnitByCode("rice");
    if (unit?.id) {
      cachedRiceBuId = unit.id;
      businessUnitId = cachedRiceBuId;
    } else {
      const { data: bu, error } = await supabase.from("business_units").select("id").eq("code", "rice").maybeSingle();
      if (error && !isRiceEmptyRead(error) && !isRiceUnconfiguredRead(error)) {
        throw new RiceError("Couldn't load Rice Mill & Warehouse.", "DATABASE");
      }
      if (!bu?.id) throw new RiceError("Rice Mill business unit was not found.", "NOT_FOUND");
      cachedRiceBuId = String(bu.id);
      businessUnitId = cachedRiceBuId;
    }
  }

  const isOwner = isOwnerRole(user.roleCode);
  const hasModule =
    isOwner || user.modules.includes("rice") || user.businessUnits.some((unit: { code: string }) => unit.code === "rice");
  if (!hasModule) {
    throw new RiceError("You do not have access to Rice Mill & Warehouse.", "UNAUTHORIZED");
  }

  return { supabase, businessUnitId, userId: user.id };
});

type ReadError = { message?: string; code?: string; details?: string } | null | undefined;

function errorBlob(error: ReadError) {
  return `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
}

export function isRiceEmptyRead(error: ReadError) {
  if (!error) return true;
  if (error.code === "PGRST116") return true;
  const blob = errorBlob(error);
  return blob.includes("json object requested") && (blob.includes("0 rows") || blob.includes("no rows") || blob.includes("or no) rows"));
}

export function isRiceMissingRelation(error: ReadError) {
  if (!error) return false;
  if (error.code === "PGRST200" || error.code === "PGRST201" || error.code === "PGRST205" || error.code === "42P01" || error.code === "42703") {
    return true;
  }
  const blob = errorBlob(error);
  return (
    blob.includes("schema cache") ||
    blob.includes("could not find the table") ||
    blob.includes("could not find a relationship") ||
    (blob.includes("does not exist") && (blob.includes("relation") || blob.includes("table") || blob.includes("column")))
  );
}

export function isRiceUnconfiguredRead(error: ReadError) {
  return isRiceEmptyRead(error) || isRiceMissingRelation(error);
}

export function mapRiceDbError(error: { message: string; code?: string } | null, operation: "load" | "save" = "save"): never {
  const fallback = operation === "load" ? "Couldn't load this page." : "Couldn't save. Please try again.";
  if (!error) throw new RiceError(fallback, "DATABASE");
  if (error.code === "23505") throw new RiceError("That record is already posted.", "CONFLICT");
  if (error.code === "23514") throw new RiceError("Check the quantities and amounts entered.", "VALIDATION");
  if (error.code === "42501" || error.message.toLowerCase().includes("permission denied")) {
    throw new RiceError("This action isn’t available.", "PRIVILEGE");
  }
  const message = error.message.replace(/^.*ERROR:\s*/i, "").split("\n")[0]?.trim() ?? fallback;
  if (/insufficient|greater than zero|cannot be negative|must be|enter |invalid|not found|authorized/i.test(message)) {
    throw new RiceError(message, "VALIDATION");
  }
  console.error(JSON.stringify({ scope: "rice", operation, code: error.code ?? null, message: error.message.slice(0, 240) }));
  throw new RiceError(fallback, "DATABASE");
}

export function riceActionError(error: unknown): string {
  unstable_rethrow(error);
  if (error instanceof RiceError) return error.message;
  console.error(JSON.stringify({ scope: "rice", operation: "action", message: String(error).slice(0, 240) }));
  return "Something went wrong. Please try again.";
}

export async function requireRicePermission(permission: string): Promise<RiceContext> {
  return requireAnyRicePermission([permission]);
}

export async function requireAnyRicePermission(permissions: string[]): Promise<RiceContext> {
  const ctx = await requireRiceContext();
  const user = await requireAuth();
  if (isOwnerRole(user.roleCode)) return ctx;
  const allowed = permissions.some((permission) =>
    user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher)),
  );
  if (!allowed) throw new RiceError("This action isn’t available.", "UNAUTHORIZED");
  return ctx;
}

export function riceHasPermission(user: { roleCode: string; permissions: string[] }, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}
