"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import {
  createSchoolStoreSaleAction,
  issueSchoolStoreStockAction,
  loadSchoolStoreWorkspaceAction,
  receiveSchoolStoreStockAction,
  saveSchoolStoreItemAction,
  searchSchoolStoreStudentsAction,
  type SchoolStoreWorkspaceResult,
} from "@/actions/school/store";
import { recordSchoolFeePaymentAction } from "@/actions/school/fees";
import { SchoolField, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
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
import { cn } from "@/lib/cn";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import {
  SCHOOL_STORE_CATEGORIES,
  schoolStoreCategoryLabel,
  schoolStoreMovementLabel,
  type SchoolStoreCaps,
  type SchoolStoreItem,
  type SchoolStoreMovement,
  type SchoolStoreSale,
  type SchoolStoreStudentOption,
  type SchoolStoreSummary,
  type SchoolStoreView,
  type SchoolStoreWorkspace,
} from "@/lib/school/store-types";

const EMPTY_SUMMARY: SchoolStoreSummary = {
  itemCount: 0,
  lowStockCount: 0,
  stockValue: 0,
  salesTotal: 0,
  collected: 0,
  outstanding: 0,
};
const EMPTY_CAPS: SchoolStoreCaps = {
  canView: false,
  canManage: false,
  canSell: false,
  canIssue: false,
  canRecordPayment: false,
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function SchoolStorePage({
  initial,
  pending = false,
}: {
  initial: SchoolStoreWorkspaceResult | null;
  pending?: boolean;
}) {
  const ready = Boolean(initial?.ok);
  const first = ready && initial?.ok ? initial.workspace : null;
  const [error, setError] = useState<string | null>(ready || pending ? null : initial?.error ?? "Couldn't load the store.");
  const [view, setView] = useState<SchoolStoreView>(first?.view ?? "overview");
  const [items, setItems] = useState<SchoolStoreItem[]>(first?.items ?? []);
  const [sales, setSales] = useState<SchoolStoreSale[]>(first?.sales ?? []);
  const [movements, setMovements] = useState<SchoolStoreMovement[]>(first?.movements ?? []);
  const [summary, setSummary] = useState<SchoolStoreSummary>(first?.summary ?? EMPTY_SUMMARY);
  const [page, setPage] = useState<SchoolPageMeta>(first?.page ?? schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<SchoolStoreCaps>(first?.capabilities ?? EMPTY_CAPS);
  const [q, setQ] = useState(first?.q ?? "");
  const [category, setCategory] = useState(first?.category ?? "");
  const [itemOpen, setItemOpen] = useState(false);
  const [receiveItem, setReceiveItem] = useState<SchoolStoreItem | null>(null);
  const [issueItem, setIssueItem] = useState<SchoolStoreItem | null>(null);
  const [saleOpen, setSaleOpen] = useState(false);
  const [paySale, setPaySale] = useState<SchoolStoreSale | null>(null);
  const seq = useRef(0);

  function apply(workspace: SchoolStoreWorkspace) {
    setView(workspace.view);
    setItems(workspace.items);
    setSales(workspace.sales);
    setMovements(workspace.movements);
    setSummary(workspace.summary);
    setPage(workspace.page);
    setCaps(workspace.capabilities);
    setQ(workspace.q);
    setCategory(workspace.category);
    setError(null);
  }

  function load(next: { view?: SchoolStoreView; q?: string; category?: string; page?: number; pageSize?: number } = {}) {
    const id = ++seq.current;
    void loadSchoolStoreWorkspaceAction({
      view: next.view ?? view,
      q: next.q ?? q,
      category: next.category === undefined ? category : next.category,
      page: next.page ?? 1,
      pageSize: next.pageSize ?? page.pageSize,
    }).then((result) => {
      if (id !== seq.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply(result.workspace);
    });
  }

  const tabs: Array<{ id: SchoolStoreView; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "items", label: "Items & Stock" },
    { id: "sales", label: "Student Sales" },
    { id: "transactions", label: "Transactions" },
  ];

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Store & Inventory</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Uniforms, stationery and school equipment from live stock records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.canSell ? (
            <button type="button" className={secondaryButton} onClick={() => setSaleOpen(true)}>
              Student sale
            </button>
          ) : null}
          {caps.canManage ? (
            <button type="button" className={primaryButton} onClick={() => setItemOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              New item
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition",
              view === tab.id ? "bg-navy text-white" : "bg-white/70 text-slate-600 hover:bg-white",
            )}
            onClick={() => {
              setView(tab.id);
              load({ view: tab.id, page: 1 });
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Stock value" value={formatTzs(summary.stockValue)} hint={`${summary.itemCount} active items`} />
        <SummaryCard label="Low stock" value={String(summary.lowStockCount)} hint="At or below threshold" />
        <SummaryCard label="Student sales" value={formatTzs(summary.salesTotal)} hint={`${formatTzs(summary.collected)} collected`} />
        <SummaryCard label="Outstanding sales" value={formatTzs(summary.outstanding)} hint="Awaiting payment" />
      </section>

      {view !== "overview" ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load({ page: 1, q });
          }}
        >
          <input
            className={cn(filterClass, "min-w-[200px] flex-1")}
            value={q}
            placeholder={view === "sales" ? "Search student or sale number" : "Search name or code"}
            onChange={(event) => setQ(event.target.value)}
          />
          {view === "items" ? (
            <select
              className={cn(filterClass, "w-auto")}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                load({ page: 1, category: event.target.value });
              }}
            >
              <option value="">All categories</option>
              {SCHOOL_STORE_CATEGORIES.map((id) => (
                <option key={id} value={id}>
                  {schoolStoreCategoryLabel(id)}
                </option>
              ))}
            </select>
          ) : null}
        </form>
      ) : null}

      {view === "overview" ? (
        <>
          {summary.lowStockCount ? (
            <section className={cn(glassPanel, "px-5 py-4")}>
              <h2 className="text-[15px] font-semibold text-navy">Low stock</h2>
              <ul className="mt-2 space-y-1 text-[13.5px] text-slate-600">
                {items
                  .filter((item) => item.isActive && item.lowStock > 0 && item.qtyOnHand <= item.lowStock)
                  .slice(0, 6)
                  .map((item) => (
                    <li key={item.id}>
                      {item.name} · {item.qtyOnHand} {item.unit} on hand
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
          <MovementTable rows={movements} empty="No stock movements yet." />
        </>
      ) : null}

      {view === "items" ? (
        items.length === 0 && !pending ? (
          <EmptyState title="No store items" body="Create a uniform, stationery or equipment item, then receive stock." />
        ) : (
          <section className={glassPanel}>
            <div className={tableScrollClass}>
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className={tableHead}>
                    {["Code", "Item", "Category", "On hand", "Selling price", "Stock value", "Status", ""].map((heading) => (
                      <th key={heading || "a"} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                      <td className="px-4 py-3">{item.sku}</td>
                      <td className="px-4 py-3">
                        {item.name}
                        {item.variant ? <span className="block text-[12px] text-slate-400">{item.variant}</span> : null}
                      </td>
                      <td className="px-4 py-3">{schoolStoreCategoryLabel(item.category)}</td>
                      <td className="px-4 py-3">
                        {item.qtyOnHand} {item.unit}
                        {item.qtyInCustody > 0 ? (
                          <span className="block text-[12px] text-slate-400">{item.qtyInCustody} in custody</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{formatAmount(item.sellingPrice)}</td>
                      <td className="px-4 py-3">{formatAmount(item.stockValue)}</td>
                      <td className="px-4 py-3">
                        <StatusPill value={item.isActive ? "Active" : "Inactive"} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {caps.canManage ? (
                            <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={() => setReceiveItem(item)}>
                              Receive
                            </button>
                          ) : null}
                          {caps.canIssue ? (
                            <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={() => setIssueItem(item)}>
                              Issue
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SchoolPagination page={page.page} total={page.total} pageSize={page.pageSize} onPage={(next) => load({ page: next })} onPageSize={(size) => load({ page: 1, pageSize: size })} />
          </section>
        )
      ) : null}

      {view === "sales" ? (
        sales.length === 0 && !pending ? (
          <EmptyState title="No student sales" body="Sales appear here after a confirmed purchase linked to a student." />
        ) : (
          <section className={glassPanel}>
            <div className={tableScrollClass}>
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className={tableHead}>
                    {["Date", "Sale", "Student", "Total", "Paid", "Outstanding", "Status", ""].map((heading) => (
                      <th key={heading || "a"} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                      <td className="px-4 py-3">{sale.saleDate}</td>
                      <td className="px-4 py-3">{sale.saleNumber}</td>
                      <td className="px-4 py-3">
                        {sale.studentName}
                        <span className="block text-[12px] text-slate-400">{sale.studentNumber}</span>
                      </td>
                      <td className="px-4 py-3">{formatAmount(sale.subtotal)}</td>
                      <td className="px-4 py-3">{formatAmount(sale.paidAmount)}</td>
                      <td className="px-4 py-3">{formatAmount(sale.outstanding)}</td>
                      <td className="px-4 py-3">
                        <StatusPill value={sale.status === "paid" ? "Paid" : sale.status === "partial" ? "Partial" : "Outstanding"} />
                      </td>
                      <td className="px-4 py-3">
                        {sale.outstanding > 0 && caps.canRecordPayment && sale.enrollmentId && sale.chargeId ? (
                          <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={() => setPaySale(sale)}>
                            Record payment
                          </button>
                        ) : sale.enrollmentId ? (
                          <Link href={`/school/fees/${sale.enrollmentId}`} className="text-[12.5px] font-semibold text-navy">
                            Fee profile
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SchoolPagination page={page.page} total={page.total} pageSize={page.pageSize} onPage={(next) => load({ page: next })} onPageSize={(size) => load({ page: 1, pageSize: size })} />
          </section>
        )
      ) : null}

      {view === "transactions" ? <MovementTable rows={movements} empty="No stock movements yet." /> : null}

      {itemOpen ? (
        <ItemDrawer
          onClose={() => setItemOpen(false)}
          onSaved={() => {
            setItemOpen(false);
            load({ view: "items" });
          }}
        />
      ) : null}
      {receiveItem ? (
        <ReceiveDrawer
          item={receiveItem}
          onClose={() => setReceiveItem(null)}
          onSaved={() => {
            setReceiveItem(null);
            load();
          }}
        />
      ) : null}
      {issueItem ? (
        <IssueDrawer
          item={issueItem}
          onClose={() => setIssueItem(null)}
          onSaved={() => {
            setIssueItem(null);
            load();
          }}
        />
      ) : null}
      {saleOpen ? (
        <SaleDrawer
          items={items.filter((item) => item.isActive && item.qtyOnHand > 0 && item.sellingPrice > 0)}
          onClose={() => setSaleOpen(false)}
          onSaved={() => {
            setSaleOpen(false);
            load({ view: "sales" });
          }}
        />
      ) : null}
      {paySale ? (
        <PayDrawer
          sale={paySale}
          onClose={() => setPaySale(null)}
          onSaved={() => {
            setPaySale(null);
            load({ view: "sales" });
          }}
        />
      ) : null}
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
      <SchoolIconWell icon={Package} />
      <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">{title}</h2>
      <p className="text-[13.5px] text-slate-500">{body}</p>
    </section>
  );
}

function MovementTable({ rows, empty }: { rows: SchoolStoreMovement[]; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} body="Receiving, sales, issues and adjustments appear here after they are posted." />;
  return (
    <section className={glassPanel}>
      <div className={tableScrollClass}>
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className={tableHead}>
              {["Date", "Type", "Item", "Qty", "Unit cost", "Details"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                <td className="px-4 py-3">{row.occurredOn}</td>
                <td className="px-4 py-3">{schoolStoreMovementLabel(row.movementType)}</td>
                <td className="px-4 py-3">
                  {row.itemName}
                  <span className="block text-[12px] text-slate-400">{row.sku}</span>
                </td>
                <td className="px-4 py-3">{row.quantity}</td>
                <td className="px-4 py-3">{formatAmount(row.unitCost)}</td>
                <td className="px-4 py-3 text-slate-500">{[row.supplier, row.recipient, row.location, row.notes, row.reference].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof SCHOOL_STORE_CATEGORIES)[number]>("UNIFORM");
  const [unit, setUnit] = useState("pcs");
  const [variant, setVariant] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ContainedDrawer
      title="New store item"
      subtitle="Codes must be unique within this school."
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Save item"
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void saveSchoolStoreItemAction({ sku, name, category, unit, variant, purchaseCost, sellingPrice, lowStock }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved();
              });
            }}
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Item code">
          <input className={inputClass} value={sku} onChange={(event) => setSku(event.target.value)} />
        </SchoolField>
        <SchoolField label="Name">
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </SchoolField>
        <SchoolField label="Category">
          <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            {SCHOOL_STORE_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {schoolStoreCategoryLabel(id)}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Unit">
          <input className={inputClass} value={unit} onChange={(event) => setUnit(event.target.value)} />
        </SchoolField>
        <SchoolField label="Size / variant (optional)">
          <input className={inputClass} value={variant} onChange={(event) => setVariant(event.target.value)} />
        </SchoolField>
        <SchoolField label="Purchase cost">
          <input className={inputClass} inputMode="decimal" value={purchaseCost} onChange={(event) => setPurchaseCost(event.target.value)} />
        </SchoolField>
        <SchoolField label="Selling price">
          <input className={inputClass} inputMode="decimal" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} />
        </SchoolField>
        <SchoolField label="Low-stock threshold">
          <input className={inputClass} inputMode="decimal" value={lowStock} onChange={(event) => setLowStock(event.target.value)} />
        </SchoolField>
      </div>
    </ContainedDrawer>
  );
}

function ReceiveDrawer({ item, onClose, onSaved }: { item: SchoolStoreItem; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(String(item.purchaseCost || ""));
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <ContainedDrawer
      title={`Receive ${item.name}`}
      subtitle={`${item.sku} · ${item.qtyOnHand} on hand`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Receive stock"
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void receiveSchoolStoreStockAction({ itemId: item.id, quantity, unitCost, occurredOn, supplier, reference, requestId }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved();
              });
            }}
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Quantity">
          <input className={inputClass} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </SchoolField>
        <SchoolField label="Unit cost">
          <input className={inputClass} inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
        </SchoolField>
        <SchoolField label="Purchase date">
          <input type="date" className={inputClass} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
        </SchoolField>
        <SchoolField label="Supplier (optional)">
          <input className={inputClass} value={supplier} onChange={(event) => setSupplier(event.target.value)} />
        </SchoolField>
        <SchoolField label="Reference (optional)">
          <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
        </SchoolField>
      </div>
    </ContainedDrawer>
  );
}

function IssueDrawer({ item, onClose, onSaved }: { item: SchoolStoreItem; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <ContainedDrawer
      title={`Issue ${item.name}`}
      subtitle={item.isDurable ? "Durable equipment stays on the school books in custody." : "Consumable issues post an expense at inventory cost."}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Issue stock"
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void issueSchoolStoreStockAction({ itemId: item.id, quantity, occurredOn, recipient, reason, location, requestId }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved();
              });
            }}
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Quantity">
          <input className={inputClass} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </SchoolField>
        <SchoolField label="Date">
          <input type="date" className={inputClass} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
        </SchoolField>
        <SchoolField label="Recipient / department">
          <input className={inputClass} value={recipient} onChange={(event) => setRecipient(event.target.value)} />
        </SchoolField>
        <SchoolField label="Reason">
          <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
        </SchoolField>
        <SchoolField label="Location (optional)">
          <input className={inputClass} value={location} onChange={(event) => setLocation(event.target.value)} />
        </SchoolField>
      </div>
    </ContainedDrawer>
  );
}

function SaleDrawer({
  items,
  onClose,
  onSaved,
}: {
  items: SchoolStoreItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SchoolStoreStudentOption[]>([]);
  const [student, setStudent] = useState<SchoolStoreStudentOption | null>(null);
  const [lines, setLines] = useState<Array<{ itemId: string; qty: string }>>([{ itemId: items[0]?.id ?? "", qty: "1" }]);
  const [paidAmount, setPaidAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [saleDate, setSaleDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const total = lines.reduce((sum, line) => {
    const item = items.find((row) => row.id === line.itemId);
    return sum + (item ? item.sellingPrice * Number(line.qty || 0) : 0);
  }, 0);

  return (
    <ContainedDrawer
      title="Student sale"
      subtitle="Nothing is posted until you confirm."
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Confirm sale"
            onClick={() => {
              if (busy || !student) {
                if (!student) setError("Select a student.");
                return;
              }
              setBusy(true);
              void createSchoolStoreSaleAction({
                studentId: student.id,
                lines: lines.map((line) => ({ itemId: line.itemId, qty: Number(line.qty) })),
                saleDate,
                paidAmount,
                method,
                reference,
                requestId,
              }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved();
              });
            }}
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Student">
          {student ? (
            <div className="flex items-center justify-between gap-2 text-[13.5px]">
              <p>
                {student.name} · {student.studentNumber}
              </p>
              <button type="button" className="font-semibold text-navy" onClick={() => setStudent(null)}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className={inputClass}
                value={query}
                placeholder="Search name or student number"
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  if (next.trim().length < 2) {
                    setMatches([]);
                    return;
                  }
                  void searchSchoolStoreStudentsAction(next).then((result) => {
                    if (result.ok) setMatches(result.students);
                  });
                }}
              />
              {matches.length ? (
                <ul className="mt-2 space-y-1">
                  {matches.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-navy/5"
                        onClick={() => {
                          setStudent(row);
                          setMatches([]);
                          setQuery("");
                        }}
                      >
                        {row.name} · {row.studentNumber}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </SchoolField>
        {lines.map((line, index) => (
          <div key={`${line.itemId}-${index}`} className="grid grid-cols-[1fr_5rem] gap-2">
            <select
              className={inputClass}
              value={line.itemId}
              onChange={(event) => {
                const next = [...lines];
                next[index] = { ...line, itemId: event.target.value };
                setLines(next);
              }}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatAmount(item.sellingPrice)} · {item.qtyOnHand} {item.unit}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              inputMode="decimal"
              value={line.qty}
              onChange={(event) => {
                const next = [...lines];
                next[index] = { ...line, qty: event.target.value };
                setLines(next);
              }}
            />
          </div>
        ))}
        <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={() => setLines([...lines, { itemId: items[0]?.id ?? "", qty: "1" }])}>
          Add item
        </button>
        <p className="text-[13.5px] font-medium text-navy">Total {formatTzs(total)}</p>
        <SchoolField label="Sale date">
          <input type="date" className={inputClass} value={saleDate} onChange={(event) => setSaleDate(event.target.value)} />
        </SchoolField>
        <SchoolField label="Amount paid now (optional)">
          <input className={inputClass} inputMode="decimal" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} />
        </SchoolField>
        {Number(paidAmount || 0) > 0 ? (
          <>
            <SchoolField label="Payment method">
              <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="BANK">Bank</option>
              </select>
            </SchoolField>
            <SchoolField label="Reference">
              <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
            </SchoolField>
          </>
        ) : null}
      </div>
    </ContainedDrawer>
  );
}

function PayDrawer({ sale, onClose, onSaved }: { sale: SchoolStoreSale; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(sale.outstanding));
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <ContainedDrawer
      title={`Pay ${sale.saleNumber}`}
      subtitle={`${sale.studentName} · outstanding ${formatTzs(sale.outstanding)}`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Record payment"
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void recordSchoolFeePaymentAction({
                enrollmentId: sale.enrollmentId,
                chargeId: sale.chargeId,
                amount,
                method,
                paymentDate: todayIso(),
                reference,
                notes: "Store sale",
                requestId,
              }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved();
              });
            }}
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Amount">
          <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </SchoolField>
        <SchoolField label="Method">
          <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="CASH">Cash</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="BANK">Bank</option>
          </select>
        </SchoolField>
        <SchoolField label="Reference">
          <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
        </SchoolField>
      </div>
    </ContainedDrawer>
  );
}
