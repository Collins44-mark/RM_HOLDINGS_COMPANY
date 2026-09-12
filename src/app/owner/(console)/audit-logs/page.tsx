import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format/datetime";

export const metadata = { title: "Audit Logs" };

export default async function AuditLogsPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: true },
  });

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="A record of important actions across RM Holdings. Operational activity is not shown on the Super Admin dashboard."
      />
      <Surface className="overflow-x-auto">
        {logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No audit events yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/5 text-[12px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Module</th>
                <th className="px-5 py-3 font-medium">Record</th>
                <th className="px-5 py-3 font-medium">Date / time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-black/4 last:border-0">
                  <td className="px-5 py-3.5 font-medium text-navy">{log.user?.name ?? "System"}</td>
                  <td className="max-w-md px-5 py-3.5 text-slate-600">{log.description}</td>
                  <td className="px-5 py-3.5 capitalize">{log.module}</td>
                  <td className="px-5 py-3.5 text-slate-500">{log.recordType ?? "—"}</td>
                  <td className="px-5 py-3.5 text-slate-500">{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
