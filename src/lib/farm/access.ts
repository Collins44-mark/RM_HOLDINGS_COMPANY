import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { getBusinessUnitByCode } from "@/lib/data/business-units";

export type FarmContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  businessUnitId: string;
  userId: string;
};

export class FarmError extends Error {
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
    this.name = "FarmError";
  }
}

let cachedFarmBuId: string | null = null;

export const requireFarmContext = cache(async (): Promise<FarmContext> => {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new FarmError("Supabase is not configured.", "NOT_CONFIGURED");
  }

  let businessUnitId = cachedFarmBuId;
  if (!businessUnitId) {
    const unit = await getBusinessUnitByCode("farm");
    if (unit?.id) {
      cachedFarmBuId = unit.id;
      businessUnitId = cachedFarmBuId;
    } else {
      const { data: bu, error } = await supabase.from("business_units").select("id").eq("code", "farm").maybeSingle();
      if (error && !isFarmEmptyRead(error) && !isFarmUnconfiguredRead(error)) {
        throw new FarmError("Couldn't load Farm & Tractor Services.", "DATABASE");
      }
      if (!bu?.id) throw new FarmError("Farm business unit was not found.", "NOT_FOUND");
      cachedFarmBuId = String(bu.id);
      businessUnitId = cachedFarmBuId;
    }
  }

  const isOwner = isOwnerRole(user.roleCode);
  const hasModule =
    isOwner || user.modules.includes("farm") || user.businessUnits.some((unit: { code: string }) => unit.code === "farm");
  if (!hasModule) {
    throw new FarmError("You do not have access to Farm & Tractor Services.", "UNAUTHORIZED");
  }

  return { supabase, businessUnitId, userId: user.id };
});

type ReadError = { message?: string; code?: string; details?: string } | null | undefined;

function errorBlob(error: ReadError) {
  return `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
}

export function isFarmEmptyRead(error: ReadError) {
  if (!error) return true;
  if (error.code === "PGRST116") return true;
  const blob = errorBlob(error);
  return blob.includes("json object requested") && (blob.includes("0 rows") || blob.includes("no rows") || blob.includes("or no) rows"));
}

export function isFarmMissingRelation(error: ReadError) {
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

export function isFarmUnconfiguredRead(error: ReadError) {
  return isFarmEmptyRead(error) || isFarmMissingRelation(error);
}

export function mapFarmDbError(error: { message: string; code?: string } | null, operation: "load" | "save" = "save"): never {
  const fallback = operation === "load" ? "Couldn't load this page." : "Couldn't save. Please try again.";
  if (!error) throw new FarmError(fallback, "DATABASE");
  if (error.code === "23505") throw new FarmError("That record is already posted.", "CONFLICT");
  if (error.code === "23514") throw new FarmError("Check the quantities and amounts entered.", "VALIDATION");
  if (error.code === "42501" || error.message.toLowerCase().includes("permission denied")) {
    throw new FarmError("This action isn’t available.", "PRIVILEGE");
  }
  const message = error.message.replace(/^.*ERROR:\s*/i, "").split("\n")[0]?.trim() ?? fallback;
  if (/insufficient|greater than zero|cannot be negative|cannot decrease|must be|enter |invalid|not found|authorized|exceed/i.test(message)) {
    throw new FarmError(message, "VALIDATION");
  }
  console.error(JSON.stringify({ scope: "farm", operation, code: error.code ?? null, message: error.message.slice(0, 240) }));
  throw new FarmError(fallback, "DATABASE");
}

export function farmActionError(error: unknown): string {
  unstable_rethrow(error);
  if (error instanceof FarmError) return error.message;
  console.error(JSON.stringify({ scope: "farm", operation: "action", message: String(error).slice(0, 240) }));
  return "Something went wrong. Please try again.";
}

export async function requireAnyFarmPermission(permissions: string[]): Promise<FarmContext> {
  const ctx = await requireFarmContext();
  const user = await requireAuth();
  if (isOwnerRole(user.roleCode)) return ctx;
  const allowed = permissions.some((permission) =>
    user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher)),
  );
  if (!allowed) throw new FarmError("This action isn’t available.", "UNAUTHORIZED");
  return ctx;
}

export function farmHasPermission(user: { roleCode: string; permissions: string[] }, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}
