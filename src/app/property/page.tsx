import { getPropertyDashboardData } from "@/actions/property/dashboard";

export default async function PropertyPage() {
  const data = await getPropertyDashboardData();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Property</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg"><div className="text-sm text-gray-500">Properties</div><div className="text-xl font-bold">{data.stats.properties}</div></div>
        <div className="p-4 bg-green-50 rounded-lg"><div className="text-sm text-gray-500">Occupied</div><div className="text-xl font-bold">{data.stats.occupied}</div></div>
        <div className="p-4 bg-amber-50 rounded-lg"><div className="text-sm text-gray-500">Vacant</div><div className="text-xl font-bold">{data.stats.vacant}</div></div>
      </div>
      <h2 className="text-lg font-semibold mb-2">Invoices</h2>
      <table className="w-full border-collapse border border-gray-200 text-sm">
        <thead className="bg-gray-100"><tr><th className="text-left p-2 border">Tenant</th><th className="text-left p-2 border">Unit</th><th className="text-left p-2 border">Amount</th><th className="text-left p-2 border">Status</th><th className="text-left p-2 border">Due</th></tr></thead>
        <tbody>
          {data.recentInvoices.map((inv: any) => {
            const amount = typeof inv.amount === "object" && inv.amount?.toNumber ? inv.amount.toNumber() : Number(inv.amount);
            return (
              <tr key={inv.id} className="border-b border-gray-100">
                <td className="p-2 border">{inv.contract?.tenant?.name ?? "—"}</td>
                <td className="p-2 border">{inv.contract?.unit?.property?.name ?? inv.contract?.unit?.name ?? "—"}</td>
                <td className="p-2 border">{amount}</td>
                <td className="p-2 border">{inv.status}</td>
                <td className="p-2 border">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
