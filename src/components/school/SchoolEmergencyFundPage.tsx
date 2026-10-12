"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Receipt } from "lucide-react";
import {
  creditSchoolEmergencyFundAction,
  loadSchoolEmergencyFundAction,
  type SchoolEmergencyFundResult,
} from "@/actions/school/expenses";
import { SchoolField, SchoolWorkflowButton } from "@/components/school/school-ui";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  downloadEmergencyFundReportCsv,
  downloadEmergencyFundReportPdf,
} from "@/lib/school/emergency-fund-pdf";
import {
  EMERGENCY_FUND_PERIODS,
  emergencyFundPeriodBounds,
  emergencyFundPeriodTotals,
  emergencyFundRunningBalances,
  filterEmergencyFundHistory,
  fundEntryKindLabel,
  parseEmergencyFundPeriod,
} from "@/lib/school/emergency-fund";
import type { ReportPeriod } from "@/lib/data/report-period";
import type { SchoolEmergencyFund } from "@/lib/school/store-types";
import {
  filterClass,
  glassCard,
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";

const EMPTY_FUND: SchoolEmergencyFund = {
  balance: 0,
  opening: 0,
  replenished: 0,
  spent: 0,
  hasOpening: false,
  entries: [],
  canManage: false,
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newRequestId() {
  return crypto.randomUUID();
}

export function SchoolEmergencyFundPage({
  initial,
  pending = false,
}: {
  initial: SchoolEmergencyFundResult | null;
  pending?: boolean;
}) {
  const ready = Boolean(initial?.ok);
  const first = ready && initial?.ok ? initial : null;
  const [error, setError] = useState<string | null>(ready || pending ? null : initial?.error ?? "Couldn't load the emergency fund.");
  const [fund, setFund] = useState<SchoolEmergencyFund>(first?.fund ?? EMPTY_FUND);
  const [schoolName, setSchoolName] = useState(first?.schoolName ?? "School Management");
  const [period, setPeriod] = useState<ReportPeriod>(first?.period ?? "this-month");
  const [from, setFrom] = useState(first?.from ?? "");
  const [to, setTo] = useState(first?.to ?? "");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const [exportOpen, setExportOpen] = useState(false);

  const bounds = emergencyFundPeriodBounds({ period, from, to });
  const totals = emergencyFundPeriodTotals(fund.entries, bounds.from, bounds.to);
  const running = emergencyFundRunningBalances(fund.entries);
  const rows = filterEmergencyFundHistory(fund.entries, bounds.from, bounds.to).sort((a, b) => {
    const date = b.occurredOn.localeCompare(a.occurredOn);
    if (date) return date;
    return b.createdAt.localeCompare(a.createdAt);
  });

  function load(next: { period?: ReportPeriod; from?: string; to?: string } = {}) {
    const seqPeriod = next.period ?? period;
    const seqFrom = next.from ?? from;
    const seqTo = next.to ?? to;
    setBusy(true);
    void loadSchoolEmergencyFundAction({ period: seqPeriod, from: seqFrom, to: seqTo }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFund(result.fund);
      setSchoolName(result.schoolName);
      setPeriod(result.period);
      setFrom(result.from);
      setTo(result.to);
      setError(null);
    });
  }

  function addFunds() {
    if (formBusy) return;
    const value = Number(amount);
    if (!(value > 0)) {
      setFormError("Amount must be greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      setFormError("Enter a valid date.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    void creditSchoolEmergencyFundAction({
      kind: fund.hasOpening ? "REPLENISH" : "OPENING",
      amount: value,
      occurredOn,
      reference,
      notes,
      requestId,
    }).then((result) => {
      setFormBusy(false);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setAmount("");
      setReference("");
      setNotes("");
      setRequestId(newRequestId());
      load();
    });
  }

  function download(kind: "pdf" | "csv") {
    const payload = {
      schoolName,
      periodLabel: bounds.label,
      from: bounds.from,
      to: bounds.to,
      fund,
    };
    if (kind === "pdf") downloadEmergencyFundReportPdf(payload);
    else downloadEmergencyFundReportCsv(payload);
    setExportOpen(false);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/school/expenses"
            aria-label="Back to Expenses"
            className={cn(
              glassCard,
              "inline-flex items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold text-navy transition duration-200 hover:bg-white/88 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b82c4]/15",
            )}
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/80 bg-white/55 text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
              <Receipt className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            Expenses
          </Link>
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy">Emergency Fund</h1>
        </div>
        <div className="relative">
          <button
            type="button"
            className={secondaryButton}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((value) => !value)}
          >
            <Download className="h-4 w-4" strokeWidth={1.85} />
            Download Report
            <ChevronDown className="h-4 w-4" strokeWidth={1.85} />
          </button>
          {exportOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-black/6 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.12)]"
            >
              <button type="button" role="menuitem" className="block w-full px-3 py-2.5 text-left text-[13.5px] text-navy hover:bg-slate-50" onClick={() => download("pdf")}>
                Download PDF
              </button>
              <button type="button" role="menuitem" className="block w-full px-3 py-2.5 text-left text-[13.5px] text-navy hover:bg-slate-50" onClick={() => download("csv")}>
                Download CSV
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Current Balance", fund.balance],
          ["Period Opening", totals.openingBalance],
          ["Added This Period", totals.added],
          ["Spent This Period", totals.spent],
        ].map(([label, value]) => (
          <article key={label} className={cn(glassCard, "px-3.5 py-2.5")}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.04em] text-navy">{formatTzs(Number(value))}</p>
          </article>
        ))}
      </section>

      {fund.canManage ? (
        <section className={cn(glassPanel, "px-5 py-5")}>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Add Funds</h2>
          <form
            className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              addFunds();
            }}
          >
            <SchoolField label="Amount (TZS)">
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </SchoolField>
            <SchoolField label="Date">
              <input type="date" className={inputClass} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
            </SchoolField>
            <SchoolField label="Reference (optional)">
              <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
            </SchoolField>
            <SchoolField label="Notes (optional)">
              <input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </SchoolField>
            <div className="flex items-end">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={formBusy}
                idleLabel="Add Funds"
                onClick={addFunds}
              />
            </div>
          </form>
          {formError ? <p className="mt-3 text-[13px] text-[#c45b66]">{formError}</p> : null}
        </section>
      ) : null}

      <section className={cn(glassPanel, "space-y-4 px-5 py-5")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Fund History</h2>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              load({ period, from, to });
            }}
          >
            <select
              className={cn(filterClass, "w-auto min-w-[160px]")}
              value={period}
              onChange={(event) => {
                const next = parseEmergencyFundPeriod(event.target.value);
                setPeriod(next);
                if (next !== "custom") load({ period: next });
              }}
            >
              {EMERGENCY_FUND_PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {period === "custom" ? (
              <>
                <input type="date" className={cn(filterClass, "w-auto")} value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Start date" />
                <input type="date" className={cn(filterClass, "w-auto")} value={to} onChange={(event) => setTo(event.target.value)} aria-label="End date" />
                <button type="submit" className={secondaryButton} disabled={busy}>
                  Apply
                </button>
              </>
            ) : null}
          </form>
        </div>

        {rows.length ? (
          <div className={tableScrollClass}>
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Date", "Type", "Funds added", "Expenditure", "Reference", "Notes", "Status", "Resulting balance"].map((heading) => (
                    <th key={heading} className="px-4 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="border-t border-navy/5 text-[13px] text-navy">
                    <td className="px-4 py-2">{entry.occurredOn}</td>
                    <td className="px-4 py-2">{fundEntryKindLabel(entry.kind)}</td>
                    <td className="px-4 py-2">{entry.kind === "SPEND" ? "—" : formatTzs(entry.amount)}</td>
                    <td className="px-4 py-2">{entry.kind === "SPEND" ? formatTzs(entry.amount) : "—"}</td>
                    <td className="px-4 py-2">{entry.reference || "—"}</td>
                    <td className="px-4 py-2">{entry.notes || "—"}</td>
                    <td className="px-4 py-2">
                      <StatusPill value={entry.isActive ? "Posted" : "Reversed"} />
                    </td>
                    <td className="px-4 py-2">{formatTzs(running.get(entry.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-slate-500">No emergency fund entries in this period.</p>
        )}
      </section>
    </div>
  );
}
