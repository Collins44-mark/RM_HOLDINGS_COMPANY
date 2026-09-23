import { UsersManager } from "@/components/users/UsersManager";
import { requireOwner } from "@/lib/auth/session";
import { listManagedUsers } from "@/lib/data/app-users";
import { listBusinessUnits } from "@/lib/data/business-units";

export const metadata = { title: "Users & Permissions" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requireOwner();
  const [users, units] = await Promise.all([listManagedUsers(), listBusinessUnits()]);

  return (
    <UsersManager
      users={users}
      currentUserId={actor.id}
      businessUnits={units.map((unit) => ({ code: unit.code, name: unit.name }))}
    />
  );
}
