import { UsersManager, type UsersWorkspaceView } from "@/components/users/UsersManager";
import { requireOwner } from "@/lib/auth/session";
import { listManagedUsers } from "@/lib/data/app-users";
import { listBusinessUnits } from "@/lib/data/business-units";
import { getRolePermissionStateBySlug, listRoleSummaries } from "@/lib/data/rbac";

export const metadata = { title: "Users & Permissions" };
export const dynamic = "force-dynamic";

function parseView(value: string | undefined): UsersWorkspaceView {
  if (value === "business-units" || value === "business") return "business";
  if (value === "roles") return "roles";
  if (value === "business-unit") return "business";
  return "all";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; unit?: string; role?: string }>;
}) {
  const actor = await requireOwner();
  const params = await searchParams;
  const view = parseView(params.view);
  const roleSlug = typeof params.role === "string" ? params.role : "";
  const [users, units, roles, initialRoleState] = await Promise.all([
    listManagedUsers(),
    listBusinessUnits(),
    listRoleSummaries(),
    view === "roles" && roleSlug ? getRolePermissionStateBySlug(roleSlug) : Promise.resolve(null),
  ]);
  const unitCode = typeof params.unit === "string" ? params.unit : "";
  const selectedUnit = units.find((unit) => unit.code === unitCode) ?? null;

  return (
    <UsersManager
      initialView={view}
      initialUnitCode={selectedUnit?.code ?? null}
      initialRoleState={initialRoleState}
      users={users}
      roles={roles}
      currentUserId={actor.id}
      businessUnits={units.map((unit) => ({
        code: unit.code,
        name: unit.name,
        assignedUserCount: unit.assignedUserCount,
        accent: unit.accent,
        iconBg: unit.iconBg,
      }))}
    />
  );
}
