"use client";
export default function PropertyIncomeChart({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  const visible = data.slice(-6);
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
      <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold text-slate-800">Monthly Rental Income</h3></div>
      <div className="flex items-end gap-2 h-64">
        {visible.map((d) => (
          <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full group">
            <div className="w-full bg-indigo-500/90 rounded-t-md transition-all group-hover:bg-indigo-400" style={{ height: `${(d.amount / max) * 100}%` }} />
            <div className="text-[10px] text-slate-500 mt-1 rotate-45 origin-top-left whitespace-nowrap">{d.month}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-2">{visible.map((d) => <span key={d.month}>{d.month}</span>)}</div>
    </div>
  );
}
