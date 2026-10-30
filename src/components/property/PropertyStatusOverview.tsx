"use client";
export default function PropertyStatusOverview({ stats }: { stats: { paid: number; unpaid: number; overdue: number; totalInv: number } }) {
  const items = [
    { label: "Paid", value: stats.paid, pct: stats.totalInv ? Math.round((stats.paid / stats.totalInv) * 100) : 0, color: "bg-emerald-400" },
    { label: "Pending", value: stats.unpaid, pct: stats.totalInv ? Math.round((stats.unpaid / stats.totalInv) * 100) : 0, color: "bg-amber-400" },
    { label: "Overdue", value: stats.overdue, pct: stats.totalInv ? Math.round((stats.overdue / stats.totalInv) * 100) : 0, color: "bg-rose-400" },
  ];
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Rent Status Overview</h3>
      <div className="space-y-4">
        {items.map((i) => (
          <div key={i.label}>
            <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{i.label}</span><span className="font-semibold text-slate-800">{i.value}</span></div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${i.color} rounded-full`} style={{ width: `${i.pct}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
