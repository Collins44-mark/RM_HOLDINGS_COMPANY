import { UsersManager, type UsersWorkspaceView } from "@/components/users/UsersManager";
import { requireOwner } from "@/lib/auth/session";
import { listManagedUsers, listManagedUsersForBusinessUnit } from "@/lib/data/app-users";
import { listBusinessUnits } from "@/lib/data/business-units";

export const metadata = { title: "Users & Permissions" };
export const dynamic = "force-dynamic";

function parseView(value: string | undefined): UsersWorkspaceView {
  if (value === "business-units" || value === "business-unit") return value;
  return "all";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; unit?: string }>;
}) {
  const actor = await requireOwner();
  const params = await searchParams;
  const requestedView = parseView(params.view);
  const unitCode = typeof params.unit === "string" ? params.unit : "";

  const units = await listBusinessUnits();
  const selectedUnit = units.find((unit) => unit.code === unitCode) ?? null;
  const view: UsersWorkspaceView =
    requestedView === "business-unit" && !selectedUnit ? "business-units" : requestedView;

  const users =
    view === "business-units"
      ? []
      : view === "business-unit" && selectedUnit
        ? await listManagedUsersForBusinessUnit(selectedUnit.id)
        : await listManagedUsers();

  return (
    <UsersManager
      key={`${view}-${selectedUnit?.code ?? "all"}`}
      view={view}
      users={users}
      currentUserId={actor.id}
      selectedUnit={
        selectedUnit
          ? {
              code: selectedUnit.code,
              name: selectedUnit.name,
              assignedUserCount: selectedUnit.assignedUserCount,
              accent: selectedUnit.accent,
              iconBg: selectedUnit.iconBg,
            }
          : null
      }
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
