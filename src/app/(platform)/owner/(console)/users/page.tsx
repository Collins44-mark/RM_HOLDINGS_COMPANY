import { UsersManager } from "@/components/users/UsersManager";
import { requireOwner } from "@/lib/auth/session";
import { listManagedUsers } from "@/lib/data/app-users";

export const metadata = { title: "Users & Permissions" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requireOwner();
  const users = await listManagedUsers();

  return <UsersManager users={users} currentUserId={actor.id} />;
}
