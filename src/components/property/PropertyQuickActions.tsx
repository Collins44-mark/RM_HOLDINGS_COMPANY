"use client";
export default function PropertyQuickActions() {
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 shadow-xl shadow-indigo-200/40 text-white">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        <a href="#" className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition backdrop-blur">+ Add Unit</a>
        <a href="#" className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition backdrop-blur">+ New Contract</a>
        <a href="#" className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition backdrop-blur">Generate Invoice</a>
        <a href="#" className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition backdrop-blur">Record Expense</a>
      </div>
    </div>
  );
}
