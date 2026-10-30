export default function PropertyInvoices({ invoices }: { invoices: { id: string; contract?: { tenant?: { name?: string }; unit?: { property?: { name?: string }; name?: string } }; amount: any; status: string; dueDate?: string | Date }[] }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40 mb-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Rent Invoices</h3>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200"><th className="pb-2">Tenant</th><th className="pb-2">Unit / Property</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Due</th></tr></thead>
        <tbody>
          {invoices.map((inv: any) => {
            const amount = typeof inv.amount === "object" && inv.amount?.toNumber ? inv.amount.toNumber() : Number(inv.amount);
            return (
              <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 text-slate-800">{inv.contract?.tenant?.name ?? "—"}</td>
                <td className="py-3 text-slate-600">{inv.contract?.unit?.property?.name ?? inv.contract?.unit?.name ?? "—"}</td>
                <td className="py-3 font-medium text-slate-800">£{amount.toFixed(2)}</td>
                <td className="py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{inv.status}</span></td>
                <td className="py-3 text-slate-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
