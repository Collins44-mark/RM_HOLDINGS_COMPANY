import { hasPermission } from "@/lib/auth/rbac";
import { identityFromUser } from "@/lib/auth/types";

export async function resolveBeekeepingUnit(user: any, admin: any) {
  const roleCode = user?.roleCode || "";
  const isOwner = roleCode === "OWNER" || roleCode === "SUPER_ADMIN";
  if (!isOwner && !user?.businessUnits?.length && !(user?.modules || []).includes("beekeeping") && !(user?.modules || []).includes("*")) {
    return { error: "Not authorized for beekeeping operations", status: 403 as const };
  }
  const { data } = await admin.from("business_units").select("id").eq("code", "beekeeping").maybeSingle();
  if (!data?.id) return { error: "Beekeeping business unit is not configured", status: 401 as const };
  const assigned = user?.businessUnits || [];
  const allowed = isOwner || (user?.modules || []).includes("*") || (user?.modules || []).includes("beekeeping") || assigned.some((unit: { code?: string }) => unit?.code === "beekeeping") || assigned.length === 1;
  if (!allowed) return { error: "Not authorized for beekeeping operations", status: 403 as const };
  return { buId: String(data.id) };
}

export function denyBee(user: any, permission: string) {
  const identity = identityFromUser(user);
  if (hasPermission(identity, permission)) return null;
  return { error: "You do not have permission for this action", status: 403 as const };
}
