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
import { formatTzs } from "@/lib/format/currency";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import { formatCompactStaffNumber } from "@/lib/school/student-number";
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
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newRequestId() {
  return crypto.randomUUID();
}

function payStatusLabel(status: SalaryStaffRow["payStatus"]) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  if (status === "unpaid") return "Unpaid";
  return "—";
}

export function SchoolSalaryPage({
  initial,
  pending = false,
  ownerHref,
  lockedUnitCode,
}: {
  initial: SchoolSalaryWorkspaceResult | null;
  pending?: boolean;
  ownerHref?: boolean;
  lockedUnitCode?: string;
}) {
  const ready = Boolean(initial?.ok);
  const first = ready && initial?.ok ? initial.workspace : null;
  const lockUnit = lockedUnitCode || first?.lockedUnitCode || "";
  const [error, setError] = useState<string | null>(
    ready || pending ? null : initial && !initial.ok ? initial.error : "Couldn't load salaries.",
  );
  const [rows, setRows] = useState<SalaryStaffRow[]>(first?.employees ?? []);
  const [payees, setPayees] = useState<SalaryStaffRow[]>(first?.payees ?? []);
  const [payments, setPayments] = useState(first?.payments ?? []);
  const [summary, setSummary] = useState<SalarySummary>(first?.summary ?? EMPTY_SUMMARY);
  const [page, setPage] = useState<SchoolPageMeta>(first?.page ?? schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<SalaryCaps>(first?.capabilities ?? EMPTY_CAPS);
  const [units, setUnits] = useState(first?.units ?? []);
  const [from, setFrom] = useState(first?.from ?? "");
  const [to, setTo] = useState(first?.to ?? "");
  const [unitCode, setUnitCode] = useState(lockUnit || first?.unitCode || "");
  const [q, setQ] = useState(first?.q ?? "");
  const [status, setStatus] = useState(first?.status || "active");
  const [periodYear, setPeriodYear] = useState(first?.periodYear ?? new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(first?.periodMonth ?? new Date().getMonth() + 1);
  const [listBusy, setListBusy] = useState(false);
  const [payRow, setPayRow] = useState<SalaryStaffRow | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [editRow, setEditRow] = useState<SalaryStaffRow | null>(null);
  const requestSeq = useRef(0);

  function applyWorkspace(workspace: SalaryWorkspace) {
    setRows(workspace.employees);
    setPayees(workspace.payees);
    setPayments(workspace.payments);
    setSummary(workspace.summary);
    setPage(workspace.page);
    setCaps(workspace.capabilities);
    setUnits(workspace.units);
    setFrom(workspace.from);
    setTo(workspace.to);
    setUnitCode(lockUnit || workspace.unitCode);
    setPeriodYear(workspace.periodYear);
    setPeriodMonth(workspace.periodMonth);
    setError(null);
  }

  function load(next: {
    page?: number;
    from?: string;
    to?: string;
    q?: string;
    status?: string;
    unitCode?: string;
    periodYear?: number;
    periodMonth?: number;
  }) {
    const seq = ++requestSeq.current;
    setListBusy(true);
    void loadSchoolSalaryWorkspaceAction({
      page: next.page ?? 1,
      period: "custom",
      from: next.from ?? from,
      to: next.to ?? to,
      q: next.q ?? q,
      status: next.status ?? status,
      unitCode: lockUnit || next.unitCode || unitCode,
      lockedUnitCode: lockUnit,
      periodYear: next.periodYear ?? periodYear,
      periodMonth: next.periodMonth ?? periodMonth,
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

  const cards = [
    ["Employees with salary", String(summary.employeeCount), "Active arrangements only"],
    ["Monthly commitment", formatTzs(summary.commitment), "Configured salaries, not cash"],
    ["Paid this period", formatTzs(summary.paid), "Posted salary expenses"],
    ["Remaining this period", formatTzs(summary.outstanding), "Commitment minus payments"],
  ] as const;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Salaries</h1>
          <p className="mt-1 max-w-[42rem] text-[13.5px] leading-5 text-slate-500">
            Monthly commitments are not cash. Posted salary payments become expenses once.
          </p>
        </div>
        {caps.canPay ? (
          <SchoolWorkflowButton className={primaryButton} busy={false} idleLabel="Pay Salary" onClick={() => setPayOpen(true)} />
        ) : null}
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <section
            key={label}
            className={cn(glassCard, "flex min-h-[148px] flex-col justify-between gap-3 px-5 py-5 sm:px-6 sm:py-6")}
          >
            <p className="text-[12.5px] font-medium leading-5 text-slate-500">{label}</p>
            <p className="break-words text-[22px] font-semibold leading-7 tracking-[-0.045em] text-navy">{value}</p>
            <p className="text-[12px] leading-4 text-slate-400">{hint}</p>
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
          <option value="inactive">Inactive employees</option>
          <option value="">All statuses</option>
        </select>
        <select
          className={cn(filterClass, "w-auto")}
          value={periodMonth}
          onChange={(event) => {
            const next = Number(event.target.value);
            setPeriodMonth(next);
            load({ page: 1, periodMonth: next });
          }}
        >
          {MONTHS.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={cn(filterClass, "w-auto")}
          value={periodYear}
          onChange={(event) => {
            const next = Number(event.target.value);
            setPeriodYear(next);
            load({ page: 1, periodYear: next });
          }}
        >
          {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        {ownerHref && !lockUnit ? (
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
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No salary arrangements match these filters.</h2>
          <p className="text-[13.5px] text-slate-500">Employees without a configured salary are not listed here.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className={cn("w-full text-left", ownerHref ? "min-w-[960px]" : "min-w-[820px]")}>
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Job title</th>
                  {ownerHref ? <th className="px-4 py-3 font-semibold">Business unit</th> : null}
                  <th className="px-4 py-3 font-semibold">Monthly salary</th>
                  <th className="px-4 py-3 font-semibold">Paid</th>
                  <th className="px-4 py-3 font-semibold">Remaining</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.arrangementId} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link href={`/school/staff/${row.id}`} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-[12px] text-slate-500">{formatCompactStaffNumber(row.staffNumber)}</p>
                    </td>
                    <td className="px-4 py-3">{row.jobTitle || row.typeName || "—"}</td>
                    {ownerHref ? <td className="px-4 py-3">{row.costBusinessUnitName}</td> : null}
                    <td className="px-4 py-3">{row.monthlySalary == null ? "—" : formatTzs(row.monthlySalary)}</td>
                    <td className="px-4 py-3">{formatTzs(row.paidInPeriod)}</td>
                    <td className="px-4 py-3">{row.outstandingInPeriod == null ? "—" : formatTzs(row.outstandingInPeriod)}</td>
                    <td className="px-4 py-3">{payStatusLabel(row.payStatus)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {caps.canManage ? (
                          <button type="button" className="text-[13px] font-semibold text-navy hover:underline" onClick={() => setEditRow(row)}>
                            Salary
                          </button>
                        ) : null}
                        {caps.canPay && row.salaryActive && (row.outstandingInPeriod ?? 0) > 0 ? (
                          <button type="button" className="text-[13px] font-semibold text-navy hover:underline" onClick={() => setPayRow(row)}>
                            Pay Salary
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
                    <td className="px-4 py-3">
                      {formatTzs(row.amount)}
                      {row.isActive ? "" : " · reversed"}
                    </td>
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
      {payRow || payOpen ? (
        <SalaryPayDrawer
          row={payRow}
          rows={payees.length ? payees : rows}
          units={units}
          lockedUnitCode={lockUnit}
          periodYear={periodYear}
          periodMonth={periodMonth}
          onClose={() => {
            setPayRow(null);
            setPayOpen(false);
          }}
          onSaved={() => {
            setPayRow(null);
            setPayOpen(false);
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
  const [allocUnit, setAllocUnit] = useState(row.costBusinessUnitId || row.businessUnitId);
  const [payday, setPayday] = useState(String(row.payday || 28));
  const [active, setActive] = useState(row.salaryActive ? "active" : "inactive");
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
      costBusinessUnitId: allocUnit,
      payday,
      salaryActive: active === "active",
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
        <p className="text-[13px] text-slate-500">Saving a salary does not record a cash payment or change posted expenses.</p>
        <SchoolField label="Monthly salary (TZS)">
          <input className={inputClass} value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Optional" />
        </SchoolField>
        <SchoolField label="Business unit">
          <select className={inputClass} value={allocUnit} onChange={(event) => setAllocUnit(event.target.value)}>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Payday (day of month)">
          <select className={inputClass} value={payday} onChange={(event) => setPayday(event.target.value)}>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Effective date">
          <input type="date" className={inputClass} value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
        </SchoolField>
        <SchoolField label="Arrangement">
          <select className={inputClass} value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
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
  rows,
  units,
  lockedUnitCode,
  periodYear,
  periodMonth,
  onClose,
  onSaved,
}: {
  row: SalaryStaffRow | null;
  rows: SalaryStaffRow[];
  units: Array<{ id: string; code: string; name: string }>;
  lockedUnitCode: string;
  periodYear: number;
  periodMonth: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const payees = rows.filter((item) => item.salaryActive && item.monthlySalary != null);
  const defaultUnit = lockedUnitCode ? units.find((unit) => unit.code === lockedUnitCode)?.id || row?.costBusinessUnitId || "" : row?.costBusinessUnitId || "";
  const [unitId, setUnitId] = useState(defaultUnit);
  const unitPayees = payees.filter((item) => !unitId || item.costBusinessUnitId === unitId);
  const [staffKey, setStaffKey] = useState(row ? `${row.id}:${row.costBusinessUnitId}` : unitPayees[0] ? `${unitPayees[0].id}:${unitPayees[0].costBusinessUnitId}` : "");
  const selected = unitPayees.find((item) => `${item.id}:${item.costBusinessUnitId}` === staffKey) ?? row;
  const remaining = selected?.outstandingInPeriod ?? null;
  const [year, setYear] = useState(periodYear);
  const [month, setMonth] = useState(periodMonth);
  const [amount, setAmount] = useState(remaining == null ? "" : String(remaining));
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());

  function save() {
    if (!selected) {
      setError("Select an employee with a salary arrangement.");
      return;
    }
    if (remaining != null && Number(amount) > remaining + 0.005) {
      setError(`The maximum remaining amount is ${formatTzs(remaining)}.`);
      return;
    }
    if (remaining === 0) {
      setError("This salary period is already paid in full.");
      return;
    }
    setBusy(true);
    setError(null);
    void recordSchoolSalaryPaymentAction({
      staffId: selected.id,
      costBusinessUnitId: selected.costBusinessUnitId,
      periodYear: year,
      periodMonth: month,
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
    <ContainedDrawer title={selected ? `Pay Salary · ${selected.name}` : "Pay Salary"} onClose={onClose}>
      <div className="space-y-3">
        <SchoolField label="Business unit">
          <select
            className={inputClass}
            value={unitId}
            disabled={Boolean(lockedUnitCode)}
            onChange={(event) => {
              setUnitId(event.target.value);
              setStaffKey("");
            }}
          >
            {lockedUnitCode ? null : <option value="">Select a module</option>}
            {units
              .filter((unit) => !lockedUnitCode || unit.code === lockedUnitCode)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
        </SchoolField>
        <SchoolField label="Employee">
          <select
            className={inputClass}
            value={staffKey}
            onChange={(event) => {
              setStaffKey(event.target.value);
              const next = unitPayees.find((item) => `${item.id}:${item.costBusinessUnitId}` === event.target.value);
              setAmount(next?.outstandingInPeriod == null ? "" : String(next.outstandingInPeriod));
            }}
          >
            <option value="">Select an employee</option>
            {unitPayees.map((item) => (
              <option key={item.arrangementId} value={`${item.id}:${item.costBusinessUnitId}`}>
                {item.name} · {formatCompactStaffNumber(item.staffNumber)}
              </option>
            ))}
          </select>
        </SchoolField>
        {selected ? (
          <p className="text-[13px] leading-5 text-slate-500">
            Monthly salary {formatTzs(selected.monthlySalary ?? 0)} · payday day {selected.payday} · already paid{" "}
            {formatTzs(selected.paidInPeriod)} · remaining {formatTzs(selected.outstandingInPeriod ?? 0)} for {year}-
            {String(month).padStart(2, "0")}.
          </p>
        ) : (
          <p className="text-[13px] text-slate-500">Only employees with an active salary for this module can be paid.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SchoolField label="Salary month">
            <select className={inputClass} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTHS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </SchoolField>
          <SchoolField label="Salary year">
            <select className={inputClass} value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </SchoolField>
        </div>
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
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Confirm payment"
            busyLabel="Saving…"
            onClick={save}
          />
        </div>
      </div>
    </ContainedDrawer>
  );
}
