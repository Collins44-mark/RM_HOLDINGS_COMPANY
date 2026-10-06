"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { EmptyState } from "@/components/ui/PageHeader";
import { formatTzs } from "@/lib/format/currency";
import { cn } from "@/lib/cn";
import {
  fetchTaxReportAction,
  listTaxRulesAction,
  saveTaxRuleAction,
} from "@/actions/supermarket/tax";
import { taxScopeLabel, type TaxRule, type TaxStatus } from "@/lib/supermarket/tax";
import {
  reconGlass,
  useReconPeriod,
} from "@/components/supermarket/reconciliation/shared";

const glass = reconGlass;

export function TaxVatPage() {
  const { preset, setPreset, range, setRange, period } = useReconPeriod();
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [modal, setModal] = useState<TaxRule | "new" | null>(null);
  const [tick, setTick] = useState(0);
  const [report, setReport] = useState<{
    collected: number;
    purchases: number;
    net: number;
    breakdown: Array<{ taxType: string; taxCode: string; rate: number; salesTax: number; purchaseTax: number; net: number }>;
    details: Array<{
      id: string;
      date: string;
      transaction: string;
      transactionType: string;
      taxType: string;
      rate: number;
      taxBase: number;
      taxAmount: number;
    }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void listTaxRulesAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setRules([]);
        return;
      }
      setError("");
      setRules(result.rules);
      setCanManage(result.canManage);
    });
    return () => {
      active = false;
    };
  }, [tick]);

  useEffect(() => {
    let active = true;
    void fetchTaxReportAction({ from: period.start, to: period.end }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setReportError(result.error);
        setReport(null);
        return;
      }
      setReportError("");
      setReport(result);
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end, tick]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Tax & VAT</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Configure applicable taxes used across Supermarket transactions.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={setPreset}
            onRange={setRange}
            ariaLabel="Tax report period"
          />
          {canManage ? (
            <button type="button" className={cn(primaryButton, "w-full sm:w-auto")} onClick={() => setModal("new")}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add Tax
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <section className={cn(glass, "overflow-hidden")}>
        <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Tax configuration</h2>
        </div>
        {rules.length === 0 && !error ? (
          <div className="px-5 pb-6">
            <EmptyState title="No tax configuration" description="Owner can add a tax rule. Until then, transactions store tax as zero." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 sm:px-5">Tax Name</th>
                  <th className="px-3 py-2.5">Rate</th>
                  <th className="px-3 py-2.5">Applicable To</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Effective From</th>
                  <th className="px-4 py-2.5 sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 font-medium text-navy sm:px-5">{rule.name}</td>
                    <td className="px-3 py-3 text-slate-500">{rule.rate}%</td>
                    <td className="px-3 py-3 text-slate-500">{taxScopeLabel(rule)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium",
                          rule.status === "ACTIVE" ? "bg-[#e7f4ea] text-[#3f8a5a]" : "bg-[#f3f6fa] text-slate-500",
                        )}
                      >
                        {rule.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{rule.effectiveFrom}</td>
                    <td className="px-4 py-3 sm:px-5">
                      {canManage ? (
                        <button type="button" className="text-[13px] font-semibold text-navy" onClick={() => setModal(rule)}>
                          Edit
                        </button>
                      ) : (
                        <span className="text-slate-400">View</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total Tax Collected", value: report ? formatTzs(report.collected) : "—" },
          { label: "Total Tax on Purchases", value: report ? formatTzs(report.purchases) : "—" },
          { label: "Net Tax Position", value: report ? formatTzs(report.net) : "—" },
        ].map((card) => (
          <article key={card.label} className={cn(glass, "px-4 py-4 sm:px-5")}>
            <p className="text-[12.5px] font-medium text-slate-500">{card.label}</p>
            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-navy">{card.value}</p>
          </article>
        ))}
      </section>

      {reportError ? <p className="text-[13px] text-[#c45b66]">{reportError}</p> : null}

      <section className={cn(glass, "overflow-hidden")}>
        <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Tax breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-4 py-2.5 sm:px-5">Tax Type</th>
                <th className="px-3 py-2.5">Rate</th>
                <th className="px-3 py-2.5">Sales Tax</th>
                <th className="px-3 py-2.5">Purchase Tax</th>
                <th className="px-4 py-2.5 sm:px-5">Net</th>
              </tr>
            </thead>
            <tbody>
              {(report?.breakdown ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No tax activity for this period.
                  </td>
                </tr>
              ) : (
                report?.breakdown.map((row) => (
                  <tr key={`${row.taxCode}-${row.rate}`} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 font-medium text-navy sm:px-5">{row.taxType}</td>
                    <td className="px-3 py-3 text-slate-500">{row.rate}%</td>
                    <td className="px-3 py-3 text-slate-500">{formatTzs(row.salesTax)}</td>
                    <td className="px-3 py-3 text-slate-500">{formatTzs(row.purchaseTax)}</td>
                    <td className="px-4 py-3 font-semibold text-navy sm:px-5">{formatTzs(row.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cn(glass, "overflow-hidden")}>
        <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Tax transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-4 py-2.5 sm:px-5">Date</th>
                <th className="px-3 py-2.5">Transaction</th>
                <th className="px-3 py-2.5">Transaction Type</th>
                <th className="px-3 py-2.5">Tax Type</th>
                <th className="px-3 py-2.5">Rate</th>
                <th className="px-3 py-2.5">Tax Base</th>
                <th className="px-4 py-2.5 sm:px-5">Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {(report?.details ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    No tax activity for this period.
                  </td>
                </tr>
              ) : (
                report?.details.map((row) => (
                  <tr key={row.id} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 text-slate-500 sm:px-5">{row.date}</td>
                    <td className="px-3 py-3 font-medium text-navy">{row.transaction}</td>
                    <td className="px-3 py-3 text-slate-500">{row.transactionType}</td>
                    <td className="px-3 py-3 text-slate-500">{row.taxType}</td>
                    <td className="px-3 py-3 text-slate-500">{row.rate}%</td>
                    <td className="px-3 py-3 text-slate-500">{formatTzs(row.taxBase)}</td>
                    <td className="px-4 py-3 font-semibold text-navy sm:px-5">{formatTzs(row.taxAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal ? (
        <TaxModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => setTick((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}

function TaxModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: TaxRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [rate, setRate] = useState(initial ? String(initial.rate) : "");
  const [sales, setSales] = useState(initial?.appliesToSales ?? true);
  const [invoices, setInvoices] = useState(initial?.appliesToSupplierInvoices ?? false);
  const [status, setStatus] = useState<TaxStatus>(initial?.status ?? "ACTIVE");
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? "");
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const valid = useMemo(() => name.trim() && code.trim() && rate !== "" && (sales || invoices) && effectiveFrom, [
    name,
    code,
    rate,
    sales,
    invoices,
    effectiveFrom,
  ]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close tax configuration" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{initial ? "Edit Tax" : "Add Tax"}</h2>
        <div className="mt-4 space-y-3">
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Tax Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Tax Code</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Rate (%)</span>
            <input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} />
          </label>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-slate-500">Applicable To</legend>
            <label className="flex items-center gap-2 text-[13.5px] text-navy">
              <input type="checkbox" checked={sales} onChange={(event) => setSales(event.target.checked)} />
              Sales / POS
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-[13.5px] text-navy">
              <input type="checkbox" checked={invoices} onChange={(event) => setInvoices(event.target.checked)} />
              Supplier Invoices
            </label>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Effective From</span>
              <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Effective To</span>
              <input type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} className={inputClass} />
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as TaxStatus)} className={inputClass}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={cn(inputClass, "h-auto py-3")} />
          </label>
        </div>
        {error ? <p className="mt-3 text-[13px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || saved || !valid}
            className={cn(primaryButton, "min-w-[7.75rem]")}
            onClick={async () => {
              setBusy(true);
              setError("");
              const result = await saveTaxRuleAction({
                id: initial?.id,
                name,
                code,
                rate: Number(rate),
                appliesToSales: sales,
                appliesToSupplierInvoices: invoices,
                status,
                effectiveFrom,
                effectiveTo: effectiveTo || null,
                notes,
              });
              setBusy(false);
              if (!result.ok) return setError(result.error);
              setSaved(true);
              onSaved();
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
              {saved ? "Saved ✓" : "Save Tax"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
