export type RoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  moduleCount: number;
  permissionCount: number;
  moduleLabel: string;
  moduleCode: string | null;
  permissionCodes: string[];
  locked: boolean;
  slug: string;
};

export type UserCustomization = {
  userId: string;
  name: string;
  roleCode: string;
  roleName: string;
  assignedUnitCodes: string[];
  moduleRoles: Record<string, string>;
  overrides: Array<{
    businessUnitCode: string;
    permissionCode: string;
    effect: "allow" | "deny";
  }>;
  effectivePermissions: string[];
};
