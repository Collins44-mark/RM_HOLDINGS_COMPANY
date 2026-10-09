"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import {
  loadSchoolExpenseListAction,
  loadSchoolExpensesWorkspaceAction,
  recordSchoolExpenseAction,
  reverseSchoolExpenseAction,
  saveSchoolExpenseTypeAction,
  type SchoolExpensesWorkspaceResult,
} from "@/actions/school/expenses";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
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
import {
  SchoolConfirmDialog,
  SchoolField,
  SchoolIconWell,
  SchoolWorkflowButton,
} from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import { REPORT_PERIOD_OPTIONS, type ReportPeriod } from "@/lib/data/report-period";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import {
  SCHOOL_EXPENSE_METHODS,
  schoolExpenseMethodLabel,
  schoolExpenseSourceHref,
  schoolExpenseSourceLabel,
  type SchoolExpenseCaps,
  type SchoolExpenseRow,
  type SchoolExpenseSummary,
  type SchoolExpenseTypeRow,
  type SchoolExpenseWorkspace,
} from "@/lib/school/expense-types";

type ExpenseListWindow = {
  key: string;
  offset: number;
  rows: SchoolExpenseRow[];
  total: number;
};

function expenseFilterKey(period: ReportPeriod, fromDate: string, toDate: string, query: string, typeId: string) {
  return `${period}|${fromDate}|${toDate}|${query}|${typeId}`;
}
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import { transportInputClass } from "@/lib/school/transport-ui";

const EMPTY_SUMMARY: SchoolExpenseSummary = { totalPosted: 0, postedCount: 0, typesUsed: 0 };
const EMPTY_CAPS: SchoolExpenseCaps = { canView: false, canRecord: false, canManageTypes: false, canReverse: false };

function todayIso() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function newRequestId() {
  return crypto.randomUUID();
}

export function SchoolExpensesPage({
  initial,
  pending = false,
}: {
  initial: SchoolExpensesWorkspaceResult | null;
  pending?: boolean;
}) {
  const ready = Boolean(initial?.ok);
  const first = ready && initial?.ok ? initial.workspace : null;
  const [error, setError] = useState<string | null>(ready || pending ? null : initial?.error ?? "Couldn't load expenses.");
  const [rows, setRows] = useState<SchoolExpenseRow[]>(first?.expenses ?? []);
  const [types, setTypes] = useState<SchoolExpenseTypeRow[]>(first?.types ?? []);
  const [summary, setSummary] = useState<SchoolExpenseSummary>(first?.summary ?? EMPTY_SUMMARY);
  const [page, setPage] = useState<SchoolPageMeta>(first?.page ?? schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<SchoolExpenseCaps>(first?.capabilities ?? EMPTY_CAPS);
  const [buses, setBuses] = useState(first?.buses ?? []);
  const [period, setPeriod] = useState<ReportPeriod>(first?.period ?? "this-month");
  const [from, setFrom] = useState(first?.from ?? "");
  const [to, setTo] = useState(first?.to ?? "");
  const [categoryId, setCategoryId] = useState(first?.categoryId ?? "");
  const [q, setQ] = useState(first?.q ?? "");
  const [listBusy, setListBusy] = useState(false);
  const [pendingPageSize, setPendingPageSize] = useState<number | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [detail, setDetail] = useState<SchoolExpenseRow | null>(null);
  const [reverseRow, setReverseRow] = useState<SchoolExpenseRow | null>(null);
  const [reverseBusy, setReverseBusy] = useState(false);
  const requestSeq = useRef(0);
  const listWindow = useRef<ExpenseListWindow | null>(
    first
      ? {
          key: expenseFilterKey(first.period, first.from, first.to, first.q, first.categoryId),
          offset: Math.max(0, (first.page.page - 1) * first.page.pageSize),
          rows: first.expenses,
          total: first.page.total,
        }
      : null,
  );

  function rememberWindow(key: string, nextPage: SchoolPageMeta, nextRows: SchoolExpenseRow[]) {
    listWindow.current = {
      key,
      offset: Math.max(0, (nextPage.page - 1) * nextPage.pageSize),
      rows: nextRows,
      total: nextPage.total,
    };
  }

  function sliceWindow(nextPage: number, nextSize: number, key: string) {
    const window = listWindow.current;
    if (!window || window.key !== key) return null;
    const start = (nextPage - 1) * nextSize;
    const meta = schoolPageMeta(nextPage, window.total, nextSize);
    const neededEnd = meta.total === 0 ? 0 : Math.min(start + nextSize, window.total);
    if (neededEnd > start && (start < window.offset || neededEnd > window.offset + window.rows.length)) return null;
    return {
      rows: neededEnd > start ? window.rows.slice(start - window.offset, neededEnd - window.offset) : [],
      page: meta,
    };
  }

  function applyWorkspace(workspace: SchoolExpenseWorkspace) {
    setRows(workspace.expenses);
    setTypes(workspace.types);
    setSummary(workspace.summary);
    setPage(workspace.page);
    setCaps(workspace.capabilities);
    setBuses(workspace.buses);
    setPeriod(workspace.period);
    setFrom(workspace.from);
    setTo(workspace.to);
    setCategoryId(workspace.categoryId);
    setError(null);
    rememberWindow(
      expenseFilterKey(workspace.period, workspace.from, workspace.to, workspace.q, workspace.categoryId),
      workspace.page,
      workspace.expenses,
    );
  }

  function load(next: {
    page?: number;
    pageSize?: number;
    q?: string;
    period?: ReportPeriod;
    from?: string;
    to?: string;
    categoryId?: string;
  } = {}) {
    const seq = ++requestSeq.current;
    setListBusy(true);
    void loadSchoolExpensesWorkspaceAction({
      page: next.page ?? page.page,
      pageSize: next.pageSize ?? page.pageSize,
      q: next.q ?? q,
      period: next.period ?? period,
      from: next.from ?? from,
      to: next.to ?? to,
      categoryId: next.categoryId === undefined ? categoryId : next.categoryId,
    }).then((result) => {
      if (seq !== requestSeq.current) return;
      setListBusy(false);
      setPendingPageSize(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyWorkspace(result.workspace);
    });
  }

  function loadList(nextPage: number, nextSize: number) {
    const key = expenseFilterKey(period, from, to, q, categoryId);
    const local = sliceWindow(nextPage, nextSize, key);
    setPage(schoolPageMeta(nextPage, page.total, nextSize));
    setPendingPageSize(nextSize === page.pageSize ? null : nextSize);
    if (local) {
      setRows(local.rows);
      setPage(local.page);
      setPendingPageSize(null);
      return;
    }
    const seq = ++requestSeq.current;
    setListBusy(true);
    void loadSchoolExpenseListAction({
      page: nextPage,
      pageSize: nextSize,
      q,
      period,
      from,
      to,
      categoryId,
    }).then((result) => {
      if (seq !== requestSeq.current) return;
      setListBusy(false);
      setPendingPageSize(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.expenses);
      setPage(result.page);
      setError(null);
      rememberWindow(expenseFilterKey(result.period, result.from, result.to, result.q, result.categoryId), result.page, result.expenses);
    });
  }

  const activeTypes = types.filter((row) => row.isActive);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Expenses</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Track and manage school operating expenses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caps.canManageTypes ? (
            <button type="button" className={secondaryButton} onClick={() => setTypesOpen(true)}>
              Expense Types
            </button>
          ) : null}
          {caps.canRecord ? (
            <button type="button" className={primaryButton} onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              Record Expense
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Expenses" value={formatTzs(summary.totalPosted)} hint="Posted in this period" />
        <SummaryCard label="Transactions" value={String(summary.postedCount)} hint="Posted expense records" />
        <SummaryCard label="Expense Types Used" value={String(summary.typesUsed)} hint="Active types with activity" />
      </section>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load({ page: 1, q });
        }}
      >
        <input
          className={cn(transportInputClass, "min-w-[200px] flex-1")}
          value={q}
          placeholder="Search description, type, reference, or payee"
          onChange={(event) => setQ(event.target.value)}
        />
        <select
          className={cn(filterClass, "w-auto min-w-[140px]")}
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
            <input
              type="date"
              className={cn(filterClass, "w-auto")}
              value={from}
              onChange={(event) => {
                const next = event.target.value;
                setFrom(next);
                if (next && to) load({ page: 1, period: "custom", from: next, to });
              }}
            />
            <input
              type="date"
              className={cn(filterClass, "w-auto")}
              value={to}
              onChange={(event) => {
                const next = event.target.value;
                setTo(next);
                if (from && next) load({ page: 1, period: "custom", from, to: next });
              }}
            />
          </>
        ) : null}
      </form>

      {types.length === 0 && !pending ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-8")}>
          <SchoolIconWell icon={Wallet} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No expense types yet</h2>
          <p className="max-w-xl text-[13.5px] text-slate-500">
            Create the operating categories this school uses, then record expenses against them.
          </p>
          {caps.canManageTypes ? (
            <button type="button" className={primaryButton} onClick={() => setTypesOpen(true)}>
              Create expense type
            </button>
          ) : null}
        </section>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <TypeCard
            name="All Expenses"
            amount={summary.totalPosted}
            count={summary.postedCount}
            selected={!categoryId}
            onSelect={() => {
              setCategoryId("");
              load({ page: 1, categoryId: "" });
            }}
          />
          {types.map((type) => (
            <TypeCard
              key={type.id}
              name={type.name}
              amount={type.postedAmount}
              count={type.postedCount}
              selected={categoryId === type.id}
              archived={!type.isActive}
              onSelect={() => {
                setCategoryId(type.id);
                load({ page: 1, categoryId: type.id });
              }}
            />
          ))}
        </div>
      )}

      {!error && rows.length === 0 && !pending ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Wallet} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No expenses recorded</h2>
          <p className="text-[13.5px] text-slate-500">
            {q || categoryId ? "No posted or reversed expenses match these filters." : "No school expenses have been recorded for this period."}
          </p>
        </section>
      ) : rows.length > 0 ? (
        <section className={glassPanel}>
          <div className={cn(tableScrollClass, listBusy && "opacity-60 transition-opacity duration-200")}>
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Date", "Expense type", "Description", "Bus", "Payment", "Amount", "Reference", "Status", ""].map(
                    (heading) => (
                      <th key={heading || "actions"} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const sourceHref = schoolExpenseSourceHref(row.sourceType);
                  return (
                    <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                      <td className="whitespace-nowrap px-4 py-3">{row.expenseDate}</td>
                      <td className="px-4 py-3">{row.categoryName || "—"}</td>
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate">{row.description || "—"}</p>
                        {row.sourceType !== "MANUAL" ? (
                          sourceHref ? (
                            <Link href={sourceHref} className="text-[11.5px] text-slate-400 hover:text-navy">
                              {schoolExpenseSourceLabel(row.sourceType)}
                            </Link>
                          ) : (
                            <p className="text-[11.5px] text-slate-400">{schoolExpenseSourceLabel(row.sourceType)}</p>
                          )
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{row.busLabel || "—"}</td>
                      <td className="px-4 py-3">{schoolExpenseMethodLabel(row.method)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{formatAmount(row.amount)}</td>
                      <td className="px-4 py-3">{row.reference || row.expenseNumber}</td>
                      <td className="px-4 py-3">
                        <StatusPill value={row.isActive ? "Posted" : "Reversed"} />
                      </td>
                      <td className="px-4 py-3">
                        <CompactActionsMenu
                          ariaLabel={`Actions for ${row.expenseNumber}`}
                          items={[
                            { label: "View details", onSelect: () => setDetail(row) },
                            ...(caps.canReverse && row.isActive && row.sourceType === "MANUAL"
                              ? [{ label: "Reverse", onSelect: () => setReverseRow(row) }]
                              : []),
                            ...(sourceHref ? [{ label: "Open in Transport", href: sourceHref }] : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SchoolPagination
            page={page.page}
            total={page.total}
            pageSize={page.pageSize}
            pendingPageSize={pendingPageSize}
            onPage={(next) => loadList(next, page.pageSize)}
            onPageSize={(size) => loadList(1, size)}
          />
        </section>
      ) : pending ? (
        <section className={cn(glassPanel, "h-40 animate-pulse")} />
      ) : null}

      {recordOpen ? (
        <RecordExpenseDrawer
          types={activeTypes}
          buses={buses.filter((bus) => bus.isActive)}
          canManageTypes={caps.canManageTypes}
          onClose={() => setRecordOpen(false)}
          onSaved={() => {
            setRecordOpen(false);
            load({ page: 1 });
          }}
        />
      ) : null}

      {typesOpen ? (
        <ExpenseTypesDrawer
          types={types}
          onClose={() => setTypesOpen(false)}
          onChanged={() => load({ page: 1 })}
        />
      ) : null}

      {detail ? (
        <ContainedDrawer
          title={detail.expenseNumber}
          subtitle={schoolExpenseSourceLabel(detail.sourceType)}
          onClose={() => setDetail(null)}
        >
          <dl className="space-y-2.5 pb-4 text-[13.5px]">
            <DetailLine label="Date" value={detail.expenseDate} />
            <DetailLine label="Expense type" value={detail.categoryName || "—"} />
            <DetailLine label="Amount" value={formatTzs(detail.amount)} />
            <DetailLine label="Payment" value={schoolExpenseMethodLabel(detail.method)} />
            <DetailLine label="Payee" value={detail.payee || "—"} />
            <DetailLine label="Bus" value={detail.busLabel || "—"} />
            <DetailLine label="Reference" value={detail.reference || "—"} />
            <DetailLine label="Status" value={detail.isActive ? "Posted" : "Reversed"} />
            <DetailLine label="Description" value={detail.description || "—"} />
          </dl>
        </ContainedDrawer>
      ) : null}

      <SchoolConfirmDialog
        open={Boolean(reverseRow)}
        title="Reverse this expense?"
        message="The posted amount will be excluded from financial totals. The record stays in the ledger for audit."
        confirmLabel="Reverse expense"
        busy={reverseBusy}
        onCancel={() => setReverseRow(null)}
        onConfirm={() => {
          if (!reverseRow || reverseBusy) return;
          setReverseBusy(true);
          void reverseSchoolExpenseAction({ id: reverseRow.id }).then((result) => {
            setReverseBusy(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setReverseRow(null);
            load();
          });
        }}
      />
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={cn(glassCard, "px-5 py-4")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
      <p className="mt-1 text-[12px] text-slate-400">{hint}</p>
    </div>
  );
}

function TypeCard({
  name,
  amount,
  count,
  selected,
  archived,
  onSelect,
}: {
  name: string;
  amount: number;
  count: number;
  selected: boolean;
  archived?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "min-w-[168px] shrink-0 rounded-[18px] border px-4 py-3 text-left transition duration-200",
        selected
          ? "border-navy/20 bg-white shadow-[0_10px_24px_rgba(15,35,64,0.08)]"
          : "border-white/70 bg-white/55 hover:bg-white/80",
      )}
    >
      <p className="truncate text-[13.5px] font-semibold text-navy">
        {name}
        {archived ? <span className="ml-1 text-[11px] font-medium text-slate-400">Archived</span> : null}
      </p>
      <p className="mt-1 text-[15px] font-semibold tracking-[-0.03em] text-navy">{formatTzs(amount)}</p>
      <p className="mt-0.5 text-[12px] text-slate-400">
        {count} {count === 1 ? "transaction" : "transactions"}
      </p>
    </button>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium text-navy">{value}</dd>
    </div>
  );
}

function RecordExpenseDrawer({
  types,
  buses,
  canManageTypes,
  onClose,
  onSaved,
}: {
  types: SchoolExpenseTypeRow[];
  buses: Array<{ id: string; registrationNumber: string; name: string }>;
  canManageTypes: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(types.find((type) => type.isSystem)?.id ?? types[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<(typeof SCHOOL_EXPENSE_METHODS)[number]["value"]>("CASH");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const [busId, setBusId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(newRequestId);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    let nextCategoryId = categoryId;
    if (!nextCategoryId && canManageTypes && newTypeName.trim()) {
      const created = await saveSchoolExpenseTypeAction({ name: newTypeName.trim() });
      if (!created.ok) {
        setBusy(false);
        setError(created.error);
        return;
      }
      nextCategoryId = created.id;
    }
    const result = await recordSchoolExpenseAction({
      categoryId: nextCategoryId,
      amount,
      expenseDate,
      description,
      method,
      payee,
      reference,
      busId,
      requestId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <ContainedDrawer
      title="Record Expense"
      subtitle="Post an operating expense to the school ledger."
      dirty={Boolean(amount || description || payee || reference || newTypeName)}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Save expense" onClick={() => void save()} />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        {types.length > 0 ? (
          <SchoolField label="Expense type">
            <select className={inputClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </SchoolField>
        ) : canManageTypes ? (
          <SchoolField label="New expense type">
            <input className={inputClass} value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} placeholder="e.g. Electricity" />
          </SchoolField>
        ) : (
          <p className="text-[13px] text-[#c45b66]">Other should be available as the default expense type. Refresh this page if it is missing.</p>
        )}
        <SchoolField label="Amount (TZS)">
          <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </SchoolField>
        <SchoolField label="Expense date">
          <input type="date" className={inputClass} value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
        </SchoolField>
        <SchoolField label="Description">
          <input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} />
        </SchoolField>
        <SchoolField label="Payment method">
          <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            {SCHOOL_EXPENSE_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Payee / supplier">
          <input className={inputClass} value={payee} onChange={(event) => setPayee(event.target.value)} />
        </SchoolField>
        <SchoolField label={method === "CASH" ? "Reference (optional)" : "Payment reference"}>
          <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
        </SchoolField>
        {buses.length > 0 ? (
          <SchoolField label="Related bus (optional)">
            <select className={inputClass} value={busId} onChange={(event) => setBusId(event.target.value)}>
              <option value="">None</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {[bus.registrationNumber, bus.name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </SchoolField>
        ) : null}
      </div>
    </ContainedDrawer>
  );
}

function ExpenseTypesDrawer({
  types,
  onClose,
  onChanged,
}: {
  types: SchoolExpenseTypeRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<SchoolExpenseTypeRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: { id?: string; name: string; description?: string; isActive?: boolean }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await saveSchoolExpenseTypeAction(next);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setDescription("");
    setEditing(null);
    onChanged();
  }

  return (
    <ContainedDrawer
      title="Expense Types"
      subtitle="Categories used when recording school expenses. Archive types instead of deleting history."
      dirty={Boolean(name || description || editing)}
      busy={busy}
      onClose={onClose}
      footer={<DrawerCancel disabled={busy} />}
    >
      <div className="space-y-4 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <div className="space-y-3 rounded-[16px] border border-navy/5 bg-white/70 p-3">
          <SchoolField label={editing ? `Edit ${editing.name}` : "New expense type"}>
            <input
              className={inputClass}
              value={name}
              disabled={Boolean(editing?.isSystem)}
              onChange={(event) => setName(event.target.value)}
            />
          </SchoolField>
          <SchoolField label="Description (optional)">
            <input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} />
          </SchoolField>
          <div className="flex gap-2">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel={editing ? "Save type" : "Create type"}
              onClick={() =>
                void save({
                  id: editing?.id,
                  name,
                  description,
                  isActive: editing ? true : undefined,
                })
              }
            />
            {editing ? (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setEditing(null);
                  setName("");
                  setDescription("");
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>
        <ul className="divide-y divide-navy/5">
          {types.map((type) => (
            <li key={type.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-navy">
                  {type.name}
                  {type.isSystem ? <span className="ml-1 text-[11px] text-slate-400">Default</span> : null}
                  {!type.isActive ? <span className="ml-1 text-[11px] text-slate-400">Archived</span> : null}
                </p>
                {type.description ? <p className="truncate text-[12.5px] text-slate-400">{type.description}</p> : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-navy"
                  onClick={() => {
                    setEditing(type);
                    setName(type.name);
                    setDescription(type.description);
                  }}
                >
                  Edit
                </button>
                {type.isActive && !type.isSystem ? (
                  <button
                    type="button"
                    className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-[#c45b66]"
                    onClick={() => void save({ id: type.id, name: type.name, description: type.description, isActive: false })}
                  >
                    Archive
                  </button>
                ) : type.isActive ? null : (
                  <button
                    type="button"
                    className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-navy"
                    onClick={() => void save({ id: type.id, name: type.name, description: type.description, isActive: true })}
                  >
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ContainedDrawer>
  );
}
