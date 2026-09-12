import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { isAppDatabaseAvailable, prisma } from "@/lib/db";

export const metadata = { title: "Users & Permissions" };

export default async function UsersPage() {
  const users = isAppDatabaseAvailable()
    ? await prisma.user.findMany({
        orderBy: { name: "asc" },
        include: {
          role: true,
          businessUnits: { include: { businessUnit: true } },
        },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Users & Permissions"
        description="Central directory of platform users, roles and business-unit assignments. Access is enforced server-side for every module."
      />
      <Surface className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/5 text-[12px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Modules</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-black/4 last:border-0">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-navy">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="px-5 py-3.5">{user.role.name}</td>
                <td className="px-5 py-3.5 text-slate-600">
                  {user.role.code === "SUPER_ADMIN" || user.role.code === "OWNER"
                    ? "All business units"
                    : user.role.code === "GROUP_ACCOUNTANT" || user.role.code === "FINANCE_MANAGER"
                      ? "Group finance"
                      : user.businessUnits.map((item) => item.businessUnit.name).join(", ") || "None"}
                </td>
                <td className="px-5 py-3.5">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {user.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
