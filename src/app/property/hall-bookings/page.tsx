export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-3xl font-extrabold">Hall Bookings</h1><p className="text-slate-500 text-sm">Manage hall reservations, event schedules and booking payments.</p></div>
          <button className="bg-[#0b2244] hover:bg-[#091e3d] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-200/40">+ New Booking</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Total Bookings</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Upcoming</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Confirmed</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Booking Revenue</div><div className="text-2xl font-extrabold text-slate-900">TZS 0</div></div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 mb-6">
          <div className="flex gap-3 mb-4"><input placeholder="Search booking..." className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm flex-1" /><select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"><option>Hall</option><option>Event Type</option><option>Status</option></select><button className="text-sm text-slate-500">Clear</button></div>
          <div className="flex gap-2 text-sm"><button className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg">List</button><button className="bg-slate-50 text-slate-600 px-3 py-1 rounded-lg">Calendar</button></div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
          <table className="w-full text-sm"><thead className="bg-slate-50"><tr className="text-left text-xs font-semibold text-slate-500"><th className="px-3 py-2">Ref</th><th>Customer</th><th>Hall</th><th>Event</th><th>Date</th><th>Amount</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody><tr className="border-t"><td className="px-3 py-3 text-slate-400">—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>TZS 0</td><td>TZS 0</td><td><span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">No records</span></td><td><button className="text-indigo-600 text-xs">View</button></td></tr></tbody></table>
        </div>
        <div className="mt-8 bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm"><h3 className="text-xl font-bold text-slate-800 mb-2">No hall bookings found.</h3><p className="text-slate-500 mb-4">Create your first hall reservation to start managing events, schedules and booking payments.</p><button className="bg-[#0b2244] text-white px-6 py-2.5 rounded-xl font-medium">+ New Booking</button></div>
      </div>
    </main>
  );
}
