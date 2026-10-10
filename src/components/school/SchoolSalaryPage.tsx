"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Banknote } from "lucide-react";
import {
  loadSchoolSalaryWorkspaceAction,
  recordSchoolSalaryPaymentAction,
  saveSchoolStaffSalaryAction,
  type SchoolSalaryWorkspaceResult,
} from "@/actions/school/salary";
import { SchoolField, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import { REPORT_PERIOD_OPTIONS, type ReportPeriod } from "@/lib/data/report-period";
import { formatTzs } from "@/lib/format/currency";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import {
  SALARY_METHODS,
  type SalaryCaps,
  type SalaryStaffRow,
  type SalarySummary,
  type SalaryWorkspace,
} from "@/lib/school/salary";
import {
  filterClass,
  glassCard,
  glassPanel,
  inputClass,
  primaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";

const EMPTY_SUMMARY: SalarySummary = { employeeCount: 0, withSalary: 0, commitment: 0, paid: 0, outstanding: 0 };
const EMPTY_CAPS: SalaryCaps = { canView: false, canManage: false, canPay: false };

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newRequestId() {
  return crypto.randomUUID();
}

export function SchoolSalaryPage({
  initial,
  pending = false,
  ownerHref,
}: {
  initial: SchoolSalaryWorkspaceResult | null;
  pending?: boolean;
  ownerHref?: boolean;
}) {
  const ready = Boolean(initial?.ok);
  const first = ready && initial?.ok ? initial.workspace : null;
  const [error, setError] = useState<string | null>(
    ready || pending ? null : initial && !initial.ok ? initial.error : "Couldn't load salaries.",
  );
  const [rows, setRows] = useState<SalaryStaffRow[]>(first?.employees ?? []);
  const [payments, setPayments] = useState(first?.payments ?? []);
  const [summary, setSummary] = useState<SalarySummary>(first?.summary ?? EMPTY_SUMMARY);
  const [page, setPage] = useState<SchoolPageMeta>(first?.page ?? schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<SalaryCaps>(first?.capabilities ?? EMPTY_CAPS);
  const [units, setUnits] = useState(first?.units ?? []);
  const [period, setPeriod] = useState<ReportPeriod>(first?.period ?? "this-month");
  const [from, setFrom] = useState(first?.from ?? "");
  const [to, setTo] = useState(first?.to ?? "");
  const [unitCode, setUnitCode] = useState(first?.unitCode ?? "");
  const [q, setQ] = useState(first?.q ?? "");
  const [status, setStatus] = useState(first?.status || "active");
  const [periodYear, setPeriodYear] = useState(first?.periodYear ?? new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(first?.periodMonth ?? new Date().getMonth() + 1);
  const [listBusy, setListBusy] = useState(false);
  const [payRow, setPayRow] = useState<SalaryStaffRow | null>(null);
  const [editRow, setEditRow] = useState<SalaryStaffRow | null>(null);
  const requestSeq = useRef(0);

  function applyWorkspace(workspace: SalaryWorkspace) {
    setRows(workspace.employees);
    setPayments(workspace.payments);
    setSummary(workspace.summary);
    setPage(workspace.page);
    setCaps(workspace.capabilities);
    setUnits(workspace.units);
    setPeriod(workspace.period);
    setFrom(workspace.from);
    setTo(workspace.to);
    setUnitCode(workspace.unitCode);
    setPeriodYear(workspace.periodYear);
    setPeriodMonth(workspace.periodMonth);
    setError(null);
  }

  function load(next: { page?: number; period?: ReportPeriod; from?: string; to?: string; q?: string; status?: string; unitCode?: string }) {
    const seq = ++requestSeq.current;
    setListBusy(true);
    void loadSchoolSalaryWorkspaceAction({
      page: next.page ?? 1,
      period: next.period ?? period,
      from: next.from ?? from,
      to: next.to ?? to,
      q: next.q ?? q,
      status: next.status ?? status,
      unitCode: next.unitCode ?? unitCode,
    }).then((result) => {
      if (seq !== requestSeq.current) return;
      setListBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyWorkspace(result.workspace);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Salaries</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Monthly commitments are not cash. Posted salary payments become school expenses once.
          </p>
        </div>
        <Link href="/school/expenses" className="text-[13px] font-medium text-slate-500 hover:text-navy">
          Posted expenses →
        </Link>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Employees", String(summary.employeeCount)],
          ["Monthly commitment", formatTzs(summary.commitment)],
          ["Paid this period", formatTzs(summary.paid)],
          ["Outstanding", formatTzs(summary.outstanding)],
        ].map(([label, value]) => (
          <section key={label} className={glassCard}>
            <p className="text-[12px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
          </section>
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load({ page: 1, q });
        }}
      >
        <select
          className={cn(filterClass, "w-auto")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            load({ page: 1, status: event.target.value });
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="">All statuses</option>
        </select>
        <select
          className={cn(filterClass, "w-auto min-w-[9rem]")}
          value={period}
          onChange={(event) => {
            const next = event.target.value as ReportPeriod;
            setPeriod(next);
            load({ page: 1, period: next });
          }}
        >
          {REPORT_PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {period === "custom" ? (
          <>
            <input type="date" className={cn(filterClass, "w-auto")} value={from} onChange={(event) => setFrom(event.target.value)} />
            <input type="date" className={cn(filterClass, "w-auto")} value={to} onChange={(event) => setTo(event.target.value)} />
          </>
        ) : null}
        {ownerHref ? (
          <select
            className={cn(filterClass, "w-auto")}
            value={unitCode}
            onChange={(event) => {
              setUnitCode(event.target.value);
              load({ page: 1, unitCode: event.target.value });
            }}
          >
            <option value="">All business units</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.code}>
                {unit.name}
              </option>
            ))}
          </select>
        ) : null}
        <input className={cn(inputClass, "min-w-[200px] flex-1")} value={q} placeholder="Search employee" onChange={(event) => setQ(event.target.value)} />
      </form>

      {rows.length === 0 && !error ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Banknote} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No employees match these filters.</h2>
          <p className="text-[13.5px] text-slate-500">Add staff first. Setting a monthly salary does not record a payment.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Job title</th>
                  <th className="px-4 py-3 font-semibold">Business unit</th>
                  <th className="px-4 py-3 font-semibold">Monthly salary</th>
                  <th className="px-4 py-3 font-semibold">Paid</th>
                  <th className="px-4 py-3 font-semibold">Outstanding</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link href={`/school/staff/${row.id}`} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-[12px] text-slate-500">{row.staffNumber}</p>
                    </td>
                    <td className="px-4 py-3">{row.jobTitle || row.typeName || "—"}</td>
                    <td className="px-4 py-3">
                      {row.allocations.length
                        ? row.allocations.map((item) => item.costBusinessUnitName).join(", ")
                        : row.businessUnitName}
                    </td>
                    <td className="px-4 py-3">{row.monthlySalary == null ? "—" : formatTzs(row.monthlySalary)}</td>
                    <td className="px-4 py-3">{formatTzs(row.paidInPeriod)}</td>
                    <td className="px-4 py-3">{row.outstandingInPeriod == null ? "—" : formatTzs(row.outstandingInPeriod)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {caps.canManage ? (
                          <button type="button" className="text-[13px] font-semibold text-navy hover:underline" onClick={() => setEditRow(row)}>
                            Salary
                          </button>
                        ) : null}
                        {caps.canPay ? (
                          <button type="button" className="text-[13px] font-semibold text-navy hover:underline" onClick={() => setPayRow(row)}>
                            Pay
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load({ page: next })} />
          {listBusy ? <p className="px-4 pb-3 text-[12.5px] text-slate-500">Updating…</p> : null}
        </section>
      )}

      {payments.length ? (
        <section className={glassPanel}>
          <h2 className="px-4 pt-4 text-[15px] font-semibold tracking-[-0.03em] text-navy">Payment history this period</h2>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">{row.staffName}</td>
                    <td className="px-4 py-3">{row.paymentDate}</td>
                    <td className="px-4 py-3">{row.method.replace("_", " ")}</td>
                    <td className="px-4 py-3">{formatTzs(row.amount)}{row.isActive ? "" : " · reversed"}</td>
                    <td className="px-4 py-3">{row.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editRow ? (
        <SalaryEditDrawer
          row={editRow}
          units={units}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            load({ page: page.page });
          }}
        />
      ) : null}
      {payRow ? (
        <SalaryPayDrawer
          row={payRow}
          periodYear={periodYear}
          periodMonth={periodMonth}
          onClose={() => setPayRow(null)}
          onSaved={() => {
            setPayRow(null);
            load({ page: page.page });
          }}
        />
      ) : null}
    </div>
  );
}

function SalaryEditDrawer({
  row,
  units,
  onClose,
  onSaved,
}: {
  row: SalaryStaffRow;
  units: Array<{ id: string; code: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [salary, setSalary] = useState(row.monthlySalary == null ? "" : String(row.monthlySalary));
  const [effectiveOn, setEffectiveOn] = useState(row.salaryEffectiveOn || todayIso());
  const [allocUnit, setAllocUnit] = useState(row.allocations[0]?.costBusinessUnitId || row.businessUnitId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setBusy(true);
    setError(null);
    const amount = salary.trim() === "" ? null : Number(salary);
    void saveSchoolStaffSalaryAction({
      staffId: row.id,
      monthlySalary: amount,
      salaryEffectiveOn: effectiveOn,
      allocations: amount != null && allocUnit ? [{ costBusinessUnitId: allocUnit, amount }] : [],
    }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <ContainedDrawer title={`Salary · ${row.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] text-slate-500">Saving a salary does not record a cash payment.</p>
        <SchoolField label="Monthly salary (TZS)">
          <input className={inputClass} value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Optional" />
        </SchoolField>
        <SchoolField label="Effective date">
          <input type="date" className={inputClass} value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
        </SchoolField>
        <SchoolField label="Cost business unit">
          <select className={inputClass} value={allocUnit} onChange={(event) => setAllocUnit(event.target.value)}>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </SchoolField>
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <DrawerCancel />
          <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Save salary" busyLabel="Saving…" onClick={save} />
        </div>
      </div>
    </ContainedDrawer>
  );
}

function SalaryPayDrawer({
  row,
  periodYear,
  periodMonth,
  onClose,
  onSaved,
}: {
  row: SalaryStaffRow;
  periodYear: number;
  periodMonth: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const remaining = row.outstandingInPeriod;
  const [amount, setAmount] = useState(remaining == null ? "" : String(remaining));
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());

  function save() {
    setBusy(true);
    setError(null);
    void recordSchoolSalaryPaymentAction({
      staffId: row.id,
      periodYear,
      periodMonth,
      amount,
      paymentDate,
      method,
      reference,
      notes,
      requestId: requestId.current,
    }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <ContainedDrawer title={`Pay · ${row.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] text-slate-500">
          Monthly salary {row.monthlySalary == null ? "not set" : formatTzs(row.monthlySalary)} · already paid{" "}
          {formatTzs(row.paidInPeriod)} for {periodYear}-{String(periodMonth).padStart(2, "0")}.
        </p>
        <SchoolField label="Amount (TZS)">
          <input className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} />
        </SchoolField>
        <SchoolField label="Payment date">
          <input type="date" className={inputClass} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
        </SchoolField>
        <SchoolField label="Method">
          <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)}>
            {SALARY_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Reference">
          <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
        </SchoolField>
        <SchoolField label="Notes">
          <input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </SchoolField>
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <DrawerCancel />
          <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Record payment" busyLabel="Saving…" onClick={save} />
        </div>
      </div>
    </ContainedDrawer>
  );
}
