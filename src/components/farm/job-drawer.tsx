import { formatTzs } from "@/lib/format/currency";
import { jobBalance } from "@/lib/farm/accounting";
function JobDrawer({ job, tab, setTab, onClose }: any) {
  if (!job) return null;
  const bal = jobBalance(job);
  return (
    <aside className="fixed top-4 right-4 bottom-4 w-[480px] max-w-[92vw] bg-white rounded-[24px] shadow-2xl z-50 overflow-hidden flex flex-col border border-slate-200" role="dialog" aria-modal="true">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-700">●</span><h2 className="text-xl font-bold text-navy leading-none">Job details</h2></div>
            <div className="text-sm text-slate-500 mt-1">{job.partyName} · {job.serviceName}</div>
            <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${job.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : job.status === "IN_PROGRESS" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{job.status}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-navy"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
        <div className="flex gap-6 mt-4 text-[13px] font-medium text-slate-600">
          <button onClick={()=>setTab("overview")} className={`pb-3 -mb-3.5 border-b-2 transition ${tab==="overview"?"text-navy border-navy":"text-slate-500 border-transparent hover:text-navy hover:border-slate-300"}`}>Overview</button>
          <button onClick={()=>setTab("payments")} className={`pb-3 -mb-3.5 border-b-2 transition ${tab==="payments"?"text-navy border-navy":"text-slate-500 border-transparent hover:text-navy hover:border-slate-300"}`}>Payments</button>
          <button onClick={()=>setTab("edit")} className={`pb-3 -mb-3.5 border-b-2 transition ${tab==="edit"?"text-navy border-navy":"text-slate-500 border-transparent hover:text-navy hover:border-slate-300"}`}>Edit</button>
        </div>
      </div>
      <div className="px-6 overflow-y-auto flex-1 min-h-0">
        {tab === "overview" && <OverviewContent job={job} bal={bal} />}
        {tab === "payments" && <PaymentsContent job={job} />}
        {tab === "edit" && <EditContent job={job} />}
      </div>
    </aside>
  );
}
function OverviewContent({ job, bal }: any) {
  return <div className="space-y-6"><section><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 mb-3">Job information</h3><div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]"><div><div className="text-slate-400 text-[11px]">Customer</div><div className="font-medium text-navy">{job.partyName}</div></div><div><div className="text-slate-400 text-[11px]">Phone</div><div className="font-medium text-navy">{job.partyPhone||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Service</div><div className="font-medium text-navy">{job.serviceName}</div></div><div><div className="text-slate-400 text-[11px]">Date</div><div className="font-medium text-navy">{job.occurredOn}</div></div><div><div className="text-slate-400 text-[11px]">Total</div><div className="font-medium text-navy">{formatTzs(job.agreedPrice)}</div></div><div><div className="text-slate-400 text-[11px]">Paid</div><div className="font-medium text-navy">{formatTzs(job.amountPaid)}</div></div><div><div className="text-slate-400 text-[11px]">Balance</div><div className="font-medium text-navy">{formatTzs(bal.receivable)}</div></div><div><div className="text-slate-400 text-[11px]">Status</div><div className="font-medium text-navy">{job.status}</div></div></div></section><section><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 mb-3">Equipment & location</h3><div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]"><div><div className="text-slate-400 text-[11px]">Location</div><div className="font-medium text-navy">{job.location||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Tractor</div><div className="font-medium text-navy">{job.tractorName||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Operator</div><div className="font-medium text-navy">{job.operatorName||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Area (ha)</div><div className="font-medium text-navy">{job.areaHa||"—"}</div></div></div></section></div>;
}
function PaymentsContent({ job }: any) { return <div className="space-y-4"><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Payment history</h3><div className="text-[13px] text-slate-500">Payments shown via backend payment model.</div></div>; }
function EditContent({ job }: any) { return <div className="text-sm text-slate-500">Edit initialized from saved job.</div>; }
export { JobDrawer, OverviewContent, PaymentsContent, EditContent };
