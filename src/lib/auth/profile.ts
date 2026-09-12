import { isOwnerRole, type AssignedBusinessUnit } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/types";

type ProfileRecord = {
  id: string;
  authUid: string | null;
  email: string;
  name: string;
  title: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  role: {
    code: string;
    name: string;
    permissions: { permission: { code: string } }[];
  };
  businessUnits: { businessUnit: { code: string; name: string } }[];
  permissions: { permission: { code: string } }[];
};

export function toAuthUser(user: ProfileRecord, sessionId: string): AuthUser {
  const assigned: AssignedBusinessUnit[] = user.businessUnits.map((item) => ({
    code: item.businessUnit.code,
    name: item.businessUnit.name,
  }));
  const modules = isOwnerRole(user.role.code)
    ? ["*"]
    : assigned.map((item) => item.code);
  const permissionSet = new Set([
    ...user.role.permissions.map((item) => item.permission.code),
    ...user.permissions.map((item) => item.permission.code),
  ]);

  return {
    id: user.id,
    authUid: user.authUid,
    email: user.email,
    name: user.name,
    title: user.title,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    roleCode: user.role.code,
    roleName: user.role.name,
    modules,
    businessUnits: assigned,
    permissions: [...permissionSet],
    isActive: user.isActive,
    sessionId,
  };
}
