"use client";
export default function PropertyKPIs({ stats }: { stats: { properties: number; totalUnits: number; occupied: number; vacant: number; occupancyPct: number; rentCollected: number; paid: number; unpaid: number; overdue: number; totalInv: number } }) {
  const cards = [
    { label: "Properties", value: stats.properties, sub: "Total holdings", color: "bg-indigo-50 text-indigo-700" },
    { label: "Occupied Units", value: stats.occupied, sub: `${stats.occupancyPct}% occupancy`, color: "bg-emerald-50 text-emerald-700" },
    { label: "Vacant Units", value: stats.vacant, sub: "Available now", color: "bg-amber-50 text-amber-700" },
    { label: "Rent Collected", value: `£${stats.rentCollected.toLocaleString()}`, sub: "Paid invoices", color: "bg-rose-50 text-rose-700" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-white/70 backdrop-blur-xl rounded-3xl p-5 shadow-xl shadow-slate-200/40 border border-white/40">
          <div className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">{c.label}</div>
          <div className="text-3xl font-extrabold text-slate-800">{c.value}</div>
          <div className="text-sm text-slate-500 mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
