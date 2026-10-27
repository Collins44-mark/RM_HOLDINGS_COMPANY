import { updateFarmJobAction } from "@/actions/farm/posting";
import { useState } from "react";
import { formatTzs } from "@/lib/format/currency";
import { jobBalance } from "@/lib/farm/accounting";
import { recordFarmJobPaymentAction } from "@/actions/farm/posting";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

function JobDrawer({ job, tab, setTab, onClose, onRefresh, workspace, onJobUpdate }: any) {
  if (!job) return null;
  const bal = jobBalance(job);
  const payments = job.payments ?? [];
  return (
    <aside className="fixed top-0 right-4 w-[480px] max-w-[92vw] bg-white rounded-[24px] shadow-2xl z-50 overflow-hidden flex flex-col border border-slate-200" style={{ height: "100dvh", maxHeight: "100dvh" }} role="dialog" aria-modal="true">
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
      <div className="px-6 overflow-y-auto flex-1 min-h-0" style={{ overflowY: "auto" }}>
        {tab === "overview" && <OverviewTab job={job} bal={bal} />}
        {tab === "payments" && <PaymentsTab job={job} onRefresh={onRefresh} />}
        {tab === "edit" && <EditTab job={job} onRefresh={onRefresh} workspace={workspace} onJobUpdate={onJobUpdate} />}
      </div>
    </aside>
  );
}

function OverviewTab({ job, bal }: any) {
  return <div className="space-y-6"><section><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 mb-3">Job information</h3><div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]"><div><div className="text-slate-400 text-[11px]">Customer</div><div className="font-medium text-navy">{job.partyName}</div></div><div><div className="text-slate-400 text-[11px]">Phone</div><div className="font-medium text-navy">{job.partyPhone||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Service</div><div className="font-medium text-navy">{job.serviceName}</div></div><div><div className="text-slate-400 text-[11px]">Date</div><div className="font-medium text-navy">{job.occurredOn}</div></div><div><div className="text-slate-400 text-[11px]">Duration</div><div className="font-medium text-navy">{job.duration||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Status</div><div className="font-medium text-navy">{job.status}</div></div><div><div className="text-slate-400 text-[11px]">Agreed total</div><div className="font-medium text-navy">{formatTzs(job.agreedPrice)}</div></div><div><div className="text-slate-400 text-[11px]">Paid</div><div className="font-medium text-navy">{formatTzs(job.amountPaid)}</div></div><div><div className="text-slate-400 text-[11px]">Balance</div><div className="font-medium text-navy">{formatTzs(bal.receivable)}</div></div><div><div className="text-slate-400 text-[11px]">Payment status</div><div className="font-medium text-navy">{bal.status}</div></div></div></section><section><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 mb-3">Equipment & location</h3><div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]"><div><div className="text-slate-400 text-[11px]">Location</div><div className="font-medium text-navy">{job.location||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Tractor</div><div className="font-medium text-navy">{job.tractorName||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Operator</div><div className="font-medium text-navy">{job.operatorName||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Area (ha)</div><div className="font-medium text-navy">{job.areaHa||"—"}</div></div><div><div className="text-slate-400 text-[11px]">Engine hours</div><div className="font-medium text-navy">{job.engineHours||"—"}</div></div></div></section></div>;
}

function PaymentsTab({ job, onRefresh }: any) {
  const payments = job.payments ?? [];
  const bal = jobBalance(job);
  return <div className="space-y-5">
    <section>
      <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 mb-3">Summary</h3>
      <div className="grid grid-cols-3 gap-3 text-[13px]">
        <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[11px] text-slate-400">Job total</div><div className="font-semibold text-navy">{formatTzs(job.agreedPrice || job.total || 0)}</div></div>
        <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[11px] text-slate-400">Total paid</div><div className="font-semibold text-navy">{formatTzs(job.amountPaid || 0)}</div></div>
        <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[11px] text-slate-400">Balance due</div><div className="font-semibold text-navy">{formatTzs(bal.receivable || 0)}</div></div>
      </div>
    </section>
    <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Payment history</h3>
    {payments.length === 0 ? <div className="text-sm text-slate-500">No payments recorded yet.</div> : <div className="space-y-2">{payments.map((p: any) => <div key={p.id} className="rounded-xl bg-slate-50 px-3 py-2.5 text-[13px]"><div className="font-medium">{formatTzs(p.amount)} · {p.paymentMethod || "—"}</div><div className="text-slate-500">{p.occurredOn ? new Date(p.occurredOn).toLocaleDateString("en-GB") : "—"}</div></div>)}</div>}
    <div className="pt-3 border-t border-slate-100"><h4 className="text-xs font-medium text-slate-500 mb-2">Record payment</h4><PaymentForm job={job} onRefresh={onRefresh} /></div>
  </div>;
}

function PaymentForm({ job, onRefresh }: any) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bal = jobBalance(job);
  const max = bal.receivable;
  return (
    <div className="space-y-2">
      <input className={inputClass} placeholder="Amount (TZS)" value={amount} onChange={e=>setAmount(e.target.value)} />
      <select className={inputClass} value={method} onChange={e=>setMethod(e.target.value)}><option>CASH</option><option>MOBILE_MONEY</option><option>BANK</option><option>CREDIT</option></select>
      {error && <div className="text-[12px] text-rose-600">{error}</div>}
      <button className={primaryButton + " w-full"} disabled={busy} onClick={async()=>{
        setBusy(true); setError("");
        const n = Number(amount);
        if (!(n>0)) { setError("Invalid amount"); setBusy(false); return; }
        if (n > max + 1) { setError("Amount exceeds balance"); setBusy(false); return; }
        try {
          const res = await recordFarmJobPaymentAction({ requestId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2), jobId: job.id, amount: String(n), occurredOn: new Date().toISOString().slice(0,10), paymentMethod: method, paymentReference: "" });
          if (res?.duplicate) { setError("Already recorded"); } else { setAmount(""); setError(""); if (onRefresh) onRefresh(); }
        } catch (e: any) { setError(e?.message || "Failed"); } finally { setBusy(false); }
      }}>{busy ? "Recording..." : "Record Payment"}</button>
    </div>
  );
}

function EditTab({ job, onRefresh, workspace, onJobUpdate }: any) {
  const [form, setForm] = useState({ partyName: job.partyName||"", serviceTypeId: job.serviceTypeId||"", duration: job.duration||"", location: job.location||"", areaHa: job.areaHa||"", tractorId: job.tractorId||"", operatorId: job.operatorId||"", occurredOn: job.occurredOn||"", agreedPrice: job.agreedPrice||"", status: job.status||"PENDING", notes: job.notes||"", engineHours: job.engineHours||"" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setBusy(true); setError(""); setSaved(false);
    try {
      const res = await updateFarmJobAction({
        jobId: job.id,
        partyId: form.partyName ? workspace?.parties?.find((p: any) => p.name === form.partyName)?.id : job.partyId,
        serviceTypeId: form.serviceTypeId || job.serviceTypeId,
        tractorId: form.tractorId || job.tractorId,
        operatorId: form.operatorId || job.operatorId,
        location: form.location,
        status: form.status,
        agreedPrice: form.agreedPrice,
        occurredOn: form.occurredOn,
        areaHa: form.areaHa,
        notes: form.notes,
        requestId: crypto.randomUUID(),
        actorId: job.recordedBy || "",
        hourMeter: form.engineHours || job.engineHours,
      });
      if (!res.ok) { setError(res.error || "Update failed"); }
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        if (onRefresh) await onRefresh(); // refresh table
        // Try to trigger parent refresh via window event or direct call if available
        try { if (typeof (window as any).location !== "undefined") { /* no reload */ } } catch {}
        if (onJobUpdate && res?.ok) {
          onJobUpdate({ ...job, status: form.status, location: form.location, agreedPrice: form.agreedPrice, occurredOn: form.occurredOn, areaHa: form.areaHa, notes: form.notes, engineHours: form.engineHours });
        }
        if (workspace?.jobs?.find((j: any) => j.id === job.id)) {
          const updated = workspace.jobs.find((j: any) => j.id === job.id);
          setForm({ partyName: updated.partyName || updated.party || "", serviceTypeId: updated.serviceTypeId || updated.service_id || "", duration: updated.duration || "", location: updated.location || "", areaHa: updated.areaHa || updated.area_ha || "", tractorId: updated.tractorId || updated.tractor_id || "", operatorId: updated.operatorId || updated.operator_id || "", occurredOn: updated.occurredOn || updated.occurred_on || "", agreedPrice: updated.agreedPrice || updated.agreed_price || "", status: updated.status || "PENDING", notes: updated.notes || "", engineHours: updated.engineHours || updated.hour_meter || "" });
        }
      }
    } catch (e: any) {
      setError((e as Error)?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return <div className="space-y-4"><h3 className="text-base font-semibold text-navy">Edit job</h3><div className="space-y-3"><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Customer</label><select className={inputClass} value={form.partyName} onChange={e=>setForm({...form,partyName:e.target.value})}><option value="">—</option>{(workspace?.parties??[]).map((p:any)=><option key={p.id} value={p.name}>{p.name}</option>)}</select></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Service</label><select className={inputClass} value={form.serviceTypeId} onChange={e=>setForm({...form,serviceTypeId:e.target.value})}><option value="">—</option>{(workspace?.services??[]).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Tractor</label><select className={inputClass} value={form.tractorId} onChange={e=>setForm({...form,tractorId:e.target.value})}><option value="">—</option>{(workspace?.tractors??[]).map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Operator</label><select className={inputClass} value={form.operatorId||""} onChange={e=>setForm({...form,operatorId:e.target.value})}><option value="">None</option>{(workspace?.staff??[]).map((st:any)=><option key={st.id} value={st.id}>{st.name}</option>)}</select></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Location</label><input className={inputClass} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} /></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label><select className={inputClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>PENDING</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option></select></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Agreed price (TZS)</label><input className={inputClass} value={form.agreedPrice} onChange={e=>setForm({...form,agreedPrice:e.target.value})} /></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Duration</label><input className={inputClass} value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} /></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label><input type="date" className={inputClass} value={form.occurredOn} onChange={e=>setForm({...form,occurredOn:e.target.value})} /></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Area (ha)</label><input className={inputClass} value={form.areaHa} onChange={e=>setForm({...form,areaHa:e.target.value})} /></div><div><label className="block text-[11px] font-medium text-slate-500 mb-1">Engine hours</label><input className={inputClass} value={form.engineHours} onChange={e=>setForm({...form,engineHours:e.target.value})} /></div></div>{error && <div className="text-[13px] text-rose-600">{error}</div>}{saved && <div className="text-[13px] text-emerald-600 animate-pulse">Saved.</div>}<div className="flex gap-3 pt-2"><button className={secondaryButton} onClick={()=>setForm({partyName:job.partyName||"",serviceTypeId:job.serviceId||"",duration:job.duration||"",location:job.location||"",areaHa:job.areaHa||"",tractorId:job.tractorId||"",operatorId:job.operatorId||"",occurredOn:job.occurredOn||"",agreedPrice:job.agreedPrice||"",status:job.status||"PENDING",notes:job.notes||"",engineHours:job.engineHours||""})}>Cancel</button><button className={primaryButton + " relative overflow-hidden"} disabled={busy} onClick={async()=>{setBusy(true);setError("");setSaved(false);try{const res=await updateFarmJobAction({jobId:job.id,partyId:form.partyName?workspace?.parties?.find((p:any)=>p.name===form.partyName)?.id:job.partyId,serviceTypeId:form.serviceTypeId||job.serviceTypeId,tractorId:form.tractorId||job.tractorId,operatorId:form.operatorId||job.operatorId,location:form.location,status:form.status,agreedPrice:form.agreedPrice,occurredOn:form.occurredOn,areaHa:form.areaHa,notes:form.notes,requestId:crypto.randomUUID(),actorId:job.recordedBy||"",hourMeter:form.engineHours||job.engineHours});if(!res.ok){setError(res.error||"Update failed");}else{setSaved(true);setTimeout(()=>setSaved(false),2000);if(onRefresh)await onRefresh();if(onJobUpdate&&res?.ok){onJobUpdate({...job,status:form.status,location:form.location,agreedPrice:form.agreedPrice,occurredOn:form.occurredOn,areaHa:form.areaHa,notes:form.notes,engineHours:form.engineHours});}if(workspace?.jobs?.find((j:any)=>j.id===job.id)){const updated=workspace.jobs.find((j:any)=>j.id===job.id);setForm({partyName:updated.partyName||updated.party||"",serviceTypeId:updated.serviceTypeId||updated.service_id||"",duration:updated.duration||"",location:updated.location||"",areaHa:updated.areaHa||updated.area_ha||"",tractorId:updated.tractorId||updated.tractor_id||"",operatorId:updated.operatorId||updated.operator_id||"",occurredOn:updated.occurredOn||updated.occurred_on||"",agreedPrice:updated.agreedPrice||updated.agreed_price||"",status:updated.status||"PENDING",notes:updated.notes||"",engineHours:updated.engineHours||updated.hour_meter||""});}}}catch(e:any){setError((e as Error)?.message||"Save failed");}finally{setBusy(false);}}}>{busy ? (<span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</span>) : saved ? (<span className="flex items-center gap-2">✓ Saved</span>) : "Save changes"}</button></div></div>;
}

export { JobDrawer, OverviewTab, PaymentsTab, EditTab };
