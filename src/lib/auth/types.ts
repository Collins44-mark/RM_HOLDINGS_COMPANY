import type { AssignedBusinessUnit } from "@/lib/auth/rbac";

export type AuthUser = {
  id: string;
  authUid: string | null;
  email: string;
  name: string;
  title: string | null;
  phone: string | null;
  avatarUrl: string | null;
  roleCode: string;
  roleName: string;
  modules: string[];
  businessUnits: AssignedBusinessUnit[];
  permissions: string[];
  isActive: boolean;
  sessionId: string;
};

export function identityFromUser(user: AuthUser) {
  return {
    role: user.roleCode,
    modules: user.modules,
    permissions: user.permissions,
  };
}
