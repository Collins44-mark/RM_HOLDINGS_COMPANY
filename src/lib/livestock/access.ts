import { hasPermission } from "@/lib/auth/rbac";
import { identityFromUser } from "@/lib/auth/types";

export async function resolveLivestockUnit(user: any, admin: any) {
  const roleCode = user?.roleCode || "";
  const isOwner = roleCode === "OWNER" || roleCode === "SUPER_ADMIN";
  if (!isOwner && !user?.businessUnits?.length && !(user?.modules || []).includes("livestock") && !(user?.modules || []).includes("*")) {
    return { error: "Not authorized for livestock operations", status: 403 as const };
  }
  const { data } = await admin.from("business_units").select("id").eq("code", "livestock").maybeSingle();
  if (!data?.id) return { error: "Livestock business unit is not configured", status: 401 as const };
  const assigned = user?.businessUnits || [];
  const allowed = isOwner || (user?.modules || []).includes("*") || (user?.modules || []).includes("livestock") || assigned.some((unit: { code?: string }) => unit?.code === "livestock") || assigned.length === 1;
  if (!allowed) return { error: "Not authorized for livestock operations", status: 403 as const };
  return { buId: String(data.id) };
}

export function denyLivestock(user: any, permissions: string[]) {
  const identity = identityFromUser(user);
  if (permissions.some((permission) => hasPermission(identity, permission))) return null;
  return { error: "You do not have permission for this action", status: 403 as const };
}
