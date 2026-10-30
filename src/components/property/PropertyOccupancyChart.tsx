"use client";
export default function PropertyOccupancyChart({ occupied, vacant, total }: { occupied: number; vacant: number; total: number }) {
  const pctOcc = total ? Math.round((occupied / total) * 100) : 0;
  const pctVac = total ? Math.round((vacant / total) * 100) : 0;
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Unit Occupancy</h3>
      <div className="flex items-center justify-center h-40 mb-4">
        <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="12" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#34d399" strokeWidth="12" strokeDasharray={`${(pctOcc / 100) * 251} 251`} strokeLinecap="round" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#fbbf24" strokeWidth="12" strokeDasharray={`${(pctVac / 100) * 251} 251`} strokeDashoffset={`-${(pctOcc / 100) * 251}`} strokeLinecap="round" />
        </svg>
        <div className="absolute text-3xl font-extrabold text-slate-800">{pctOcc}%</div>
      </div>
      <div className="flex justify-center gap-6 text-sm text-slate-600">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400" /> Occupied {occupied}</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400" /> Vacant {vacant}</div>
      </div>
    </div>
  );
}
