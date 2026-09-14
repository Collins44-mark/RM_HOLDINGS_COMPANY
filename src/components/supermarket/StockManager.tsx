"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Clock3,
  MoreHorizontal,
  Package,
  Plus,
  ScanLine,
  Search,
  TimerReset,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type { AuthUser } from "@/lib/auth/types";
import {
  SUPERMARKET_PRODUCT_CATEGORIES,
  attachStock,
  batchExpiryStatus,
  batchesForProduct,
  currentStockFor,
  findProductByBarcode,
  formatDisplayDate,
  inventoryKpis,
  movementTypeLabel,
  movementsForProduct,
  productExpiryFilterStatus,
  productExpirySummary,
  rememberNewProductBarcode,
  useSupermarketInventory,
  type ExpiryStatus,
  type StockBatch,
  type StockStatus,
  type SupermarketProduct,
} from "@/lib/data/supermarket-inventory";

type StockStatusFilter = "all" | StockStatus;
type ExpiryFilter = "all" | ExpiryStatus;
type StockSort = "name" | "stock-low" | "stock-high" | "expiry";
type DrawerMode = "add" | "view" | "history" | null;

const selectClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";
const inputClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

function canManageStock(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission(permission, matcher));
}

export function StockManager() {
  const router = useRouter();
  const { user, isSuperAdmin } = useAuth();
  const canReceive = isSuperAdmin() || canManageStock(user, "supermarket.stock.edit");
  const inventory = useSupermarketInventory();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StockStatusFilter>("all");
  const [expiry, setExpiry] = useState<ExpiryFilter>("all");
  const [sort, setSort] = useState<StockSort>("name");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefillProductId, setPrefillProductId] = useState<string | null>(null);

  const rows = useMemo(
    () => inventory.products.map((product) => attachStock(product, inventory.batches)),
    [inventory.products, inventory.batches],
  );
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const kpis = useMemo(() => inventoryKpis(inventory), [inventory]);
  const filtersActive =
    Boolean(query.trim()) || category !== "all" || status !== "all" || expiry !== "all";

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((product) => {
      if (category !== "all" && product.category !== category) return false;
      if (status !== "all" && product.stockStatus !== status) return false;
      if (expiry !== "all") {
        const expiryStatus = productExpiryFilterStatus(product.id, inventory.batches, product.stock);
        if (expiryStatus !== expiry) return false;
      }
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle) ||
        product.barcode.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "stock-low") return a.stock - b.stock;
      if (sort === "stock-high") return b.stock - a.stock;
      if (sort === "expiry") {
        const aDate = earliestSortDate(a.id, inventory.batches);
        const bDate = earliestSortDate(b.id, inventory.batches);
        if (aDate === bDate) return a.name.localeCompare(b.name);
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.localeCompare(bDate);
      }
      return a.name.localeCompare(b.name);
    });
  }, [rows, inventory.batches, query, category, status, expiry, sort]);

  function openAdd(productId?: string) {
    setMenuId(null);
    setSelectedId(productId ?? null);
    setPrefillProductId(productId ?? null);
    setDrawer("add");
  }

  function openView(productId: string) {
    const product = inventory.products.find((item) => item.id === productId);
    if (!product) return;
    setMenuId(null);
    setSelectedId(product.id);
    setDrawer("view");
  }

  function openHistory(productId: string) {
    const product = inventory.products.find((item) => item.id === productId);
    if (!product) return;
    setMenuId(null);
    setSelectedId(product.id);
    setDrawer("history");
  }

  function closePanel() {
    setDrawer(null);
    setSelectedId(null);
    setPrefillProductId(null);
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setExpiry("all");
    setSort("name");
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        title="Stock"
        description="Manage inventory levels, batches, expiry dates and stock movements."
        action={
          canReceive ? (
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white transition hover:bg-[#132844] sm:w-auto"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              Add Stock
            </button>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Products" value={String(kpis.totalProducts)} hint="Active catalogue" icon={Package} />
        <KpiCard label="Total Stock Units" value={String(kpis.totalStockUnits)} hint="All batches" icon={Warehouse} />
        <KpiCard label="Low Stock" value={String(kpis.lowStock)} hint="At or below reorder" icon={AlertTriangle} />
        <KpiCard label="Out of Stock" value={String(kpis.outOfStock)} hint="Zero units" icon={Ban} />
        <KpiCard
          label="Expiring Soon"
          value={String(kpis.expiringSoonUnits)}
          hint={`${kpis.expiringSoonProducts} products`}
          icon={Clock3}
        />
        <KpiCard
          label="Expired"
          value={String(kpis.expiredUnits)}
          hint={`${kpis.expiredProducts} products`}
          icon={TimerReset}
        />
      </section>

      <Surface className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search stock</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products..."
              className={cn(inputClass, "pl-10")}
            />
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className={selectClass}>
            <option value="all">All Categories</option>
            {SUPERMARKET_PRODUCT_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StockStatusFilter)}
            className={selectClass}
          >
            <option value="all">All Stock Status</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
          <select
            value={expiry}
            onChange={(event) => setExpiry(event.target.value as ExpiryFilter)}
            className={selectClass}
          >
            <option value="all">All Expiry</option>
            <option value="No Expiry">No Expiry</option>
            <option value="Normal">Normal</option>
            <option value="Expiring Soon">Expiring Soon</option>
            <option value="Expired">Expired</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as StockSort)} className={selectClass}>
            <option value="name">Product A-Z</option>
            <option value="stock-low">Lowest Stock</option>
            <option value="stock-high">Highest Stock</option>
            <option value="expiry">Earliest Expiry</option>
          </select>
        </div>
      </Surface>

      {visible.length === 0 ? (
        <EmptyStock filtersActive={filtersActive} onClear={clearFilters} />
      ) : (
        <>
          <Surface className="hidden xl:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">SKU</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Current Stock</th>
                    <th className="px-5 py-3 font-medium">Reorder Level</th>
                    <th className="px-5 py-3 font-medium">Stock Status</th>
                    <th className="px-5 py-3 font-medium">Expiry</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
                    <tr key={product.id} className="border-t border-black/4 hover:bg-[#fbfcfe]">
                      <td className="px-5 py-3.5">
                        <button type="button" onClick={() => openView(product.id)} className="text-left">
                          <p className="font-semibold text-navy">{product.name}</p>
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {product.unit}
                            {product.isActive ? "" : " · Inactive"}
                          </p>
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{product.sku}</td>
                      <td className="px-5 py-3.5 text-slate-600">{product.category}</td>
                      <td className="px-5 py-3.5 font-semibold text-navy">{product.stock}</td>
                      <td className="px-5 py-3.5 text-slate-600">{product.reorderLevel}</td>
                      <td className="px-5 py-3.5">
                        <StockStatusBadge status={product.stockStatus} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {productExpirySummary(product.id, inventory.batches, product.stock)}
                      </td>
                      <td className="px-5 py-3.5">
                        <RowActions
                          product={product}
                          open={menuId === product.id}
                          canReceive={canReceive}
                          onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
                          onClose={() => setMenuId(null)}
                          onView={() => openView(product.id)}
                          onAdd={() => openAdd(product.id)}
                          onHistory={() => openHistory(product.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          <Surface className="hidden md:block xl:hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Expiry</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
                    <tr key={product.id} className="border-t border-black/4 hover:bg-[#fbfcfe]">
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => openView(product.id)} className="text-left">
                          <p className="font-semibold text-navy">{product.name}</p>
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {product.sku} · {product.category}
                          </p>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-navy">
                        {product.stock}
                        <p className="mt-0.5 text-[11px] font-medium text-slate-400">ROP {product.reorderLevel}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <StockStatusBadge status={product.stockStatus} />
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {productExpirySummary(product.id, inventory.batches, product.stock)}
                      </td>
                      <td className="px-4 py-3.5">
                        <RowActions
                          product={product}
                          open={menuId === product.id}
                          canReceive={canReceive}
                          onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
                          onClose={() => setMenuId(null)}
                          onView={() => openView(product.id)}
                          onAdd={() => openAdd(product.id)}
                          onHistory={() => openHistory(product.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          <div className="space-y-2.5 md:hidden">
            {visible.map((product) => (
              <article
                key={product.id}
                className="rounded-[16px] border border-white/90 bg-white px-3.5 py-3.5 shadow-[0_6px_20px_rgba(20,40,70,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => openView(product.id)} className="min-w-0 text-left">
                    <p className="font-semibold text-navy">{product.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {product.sku} · {product.category}
                    </p>
                  </button>
                  <RowActions
                    product={product}
                    open={menuId === product.id}
                    canReceive={canReceive}
                    onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
                    onClose={() => setMenuId(null)}
                    onView={() => openView(product.id)}
                    onAdd={() => openAdd(product.id)}
                    onHistory={() => openHistory(product.id)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-navy">{product.stock} units</span>
                  <StockStatusBadge status={product.stockStatus} />
                  {product.isActive ? null : <InactiveBadge />}
                </div>
                <p className="mt-2 text-[12.5px] text-slate-500">
                  {productExpirySummary(product.id, inventory.batches, product.stock)}
                </p>
              </article>
            ))}
          </div>
        </>
      )}

      {drawer === "add" ? (
        <StockDrawer title="Add Stock" onClose={closePanel}>
          <AddStockForm
            products={inventory.products}
            batches={inventory.batches}
            prefillProductId={prefillProductId}
            onCancel={closePanel}
            onCreateProduct={(barcode) => {
              rememberNewProductBarcode(barcode);
              router.push("/supermarket/products");
            }}
            onSubmit={(input) => {
              inventory.receiveStock(input);
              closePanel();
            }}
          />
        </StockDrawer>
      ) : null}

      {drawer === "view" && selected ? (
        <StockDrawer title="Stock details" onClose={closePanel}>
          <StockDetails
            product={selected}
            batches={batchesForProduct(selected.id, inventory.batches)}
            canReceive={canReceive}
            onAddStock={() => openAdd(selected.id)}
          />
        </StockDrawer>
      ) : null}

      {drawer === "history" && selected ? (
        <StockDrawer title="Stock History" onClose={closePanel}>
          <StockHistoryPanel
            product={selected}
            movements={movementsForProduct(selected.id, inventory.movements)}
          />
        </StockDrawer>
      ) : null}
    </div>
  );
}

function earliestSortDate(productId: string, batches: { productId: string; expiryDate: string | null }[]) {
  const dated = batches
    .filter((batch) => batch.productId === productId && batch.expiryDate)
    .map((batch) => batch.expiryDate as string)
    .sort();
  return dated[0] ?? null;
}

function EmptyStock({
  filtersActive,
  onClear,
}: {
  filtersActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-6 py-14 text-center shadow-card">
      <p className="text-[15px] font-semibold text-navy">No inventory found</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {filtersActive
          ? "Nothing matches the current search or filters."
          : "Receive stock against a product from the catalogue to start inventory."}
      </p>
      {filtersActive ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <article className="flex min-w-0 items-center gap-2.5 rounded-[18px] border border-white/90 bg-white px-3 py-3 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:min-h-[96px] sm:gap-3 sm:px-4 sm:py-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f5f8] text-navy sm:h-11 sm:w-11 sm:rounded-[14px]">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500 sm:text-[12px]">{label}</p>
        <p className="mt-0.5 text-[16px] font-bold tracking-[-0.03em] text-navy sm:text-[18px]">{value}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
      </div>
    </article>
  );
}

function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
        status === "In Stock" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "Low Stock" && "bg-[#f7f1e1] text-[#8a7340]",
        status === "Out of Stock" && "bg-[#f6eaea] text-[#8a5a5a]",
      )}
    >
      {status}
    </span>
  );
}

function InactiveBadge() {
  return (
    <span className="inline-flex rounded-full bg-[#eef0f3] px-2.5 py-1 text-[11px] font-medium text-slate-500">
      Inactive
    </span>
  );
}

function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
        status === "Expired" && "bg-[#f6eaea] text-[#8a5a5a]",
        status === "Expiring Soon" && "bg-[#f7f1e1] text-[#8a7340]",
        status === "Normal" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "No Expiry" && "bg-[#eef0f3] text-slate-500",
      )}
    >
      {status}
    </span>
  );
}

function RowActions({
  product,
  open,
  canReceive,
  onToggle,
  onClose,
  onView,
  onAdd,
  onHistory,
}: {
  product: SupermarketProduct;
  open: boolean;
  canReceive: boolean;
  onToggle: () => void;
  onClose: () => void;
  onView: () => void;
  onAdd: () => void;
  onHistory: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    window.addEventListener("resize", placeMenu);
    return () => window.removeEventListener("resize", placeMenu);
  }, [open]);

  const menu = open
    ? createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-[79] cursor-default bg-transparent"
            aria-label="Close actions"
            onPointerDown={(event) => {
              event.preventDefault();
              onClose();
            }}
          />
          <div
            className="fixed z-[80] w-44 overflow-hidden rounded-[14px] border border-black/6 bg-white py-1 shadow-[0_16px_40px_rgba(16,24,40,0.12)]"
            style={{ top: coords.top, right: coords.right }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ActionItem label="View Stock" onSelect={onView} />
            {canReceive ? <ActionItem label="Add Stock" onSelect={onAdd} /> : null}
            <ActionItem label="Stock History" onSelect={onHistory} />
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) placeMenu();
          onToggle();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-[#f3f5f8] hover:text-navy"
        aria-label={`Actions for ${product.name}`}
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}

function ActionItem({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail === 0) onSelect();
      }}
      className="flex w-full px-3 py-2 text-left text-[13px] text-navy hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function StockDrawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" className="absolute inset-0 bg-navy/30" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[520px] flex-col bg-white shadow-[-18px_0_40px_rgba(16,24,40,0.12)]">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-500 hover:bg-[#f3f5f8]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

function AddStockForm({
  products,
  batches,
  prefillProductId,
  onCancel,
  onCreateProduct,
  onSubmit,
}: {
  products: SupermarketProduct[];
  batches: StockBatch[];
  prefillProductId: string | null;
  onCancel: () => void;
  onCreateProduct: (barcode: string) => void;
  onSubmit: (input: {
    productId: string;
    quantity: number;
    batchNumber?: string;
    expiryDate?: string | null;
    buyingPrice: number;
    supplier?: string;
    receivedAt?: string;
  }) => void;
}) {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const prefilled = products.find((item) => item.id === prefillProductId) ?? null;
  const [barcode, setBarcode] = useState(prefilled?.barcode ?? "");
  const [productQuery, setProductQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(prefilled?.id ?? null);
  const [notFound, setNotFound] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [buyingPrice, setBuyingPrice] = useState(prefilled ? String(prefilled.buyingPrice) : "");
  const [supplier, setSupplier] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selected = products.find((item) => item.id === selectedId) ?? null;
  const matches = useMemo(() => {
    const needle = productQuery.trim().toLowerCase();
    if (!needle) return products.slice(0, 8);
    return products
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.sku.toLowerCase().includes(needle) ||
          item.barcode.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [productQuery, products]);

  function selectProduct(product: SupermarketProduct) {
    setSelectedId(product.id);
    setBarcode(product.barcode);
    setBuyingPrice(String(product.buyingPrice));
    setNotFound(false);
    setProductQuery("");
    setErrors((current) => {
      const next = { ...current };
      delete next.product;
      delete next.barcode;
      return next;
    });
  }

  function lookupBarcode(code: string) {
    const match = findProductByBarcode(products, code);
    if (match) {
      selectProduct(match);
      return;
    }
    setSelectedId(null);
    setNotFound(Boolean(code.trim()));
  }

  function submit() {
    const nextErrors: Record<string, string> = {};
    const qty = Number(quantity);
    const price = Number(buyingPrice);
    if (!selected) nextErrors.product = "Select a product from the catalogue.";
    if (!Number.isFinite(qty) || qty <= 0) nextErrors.quantity = "Enter a quantity greater than zero.";
    if (!Number.isFinite(price) || price < 0) nextErrors.buyingPrice = "Enter a valid buying price.";
    if (selected?.trackExpiry && !expiryDate.trim()) {
      nextErrors.expiryDate = "Enter an expiry date for this batch.";
    }
    if (!receivedAt) nextErrors.receivedAt = "Enter the received date.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    onSubmit({
      productId: selected!.id,
      quantity: qty,
      batchNumber,
      expiryDate: selected?.trackExpiry ? expiryDate : null,
      buyingPrice: price,
      supplier,
      receivedAt,
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Find product
        </h3>
        <div className="mt-3 space-y-3">
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Scan / Enter Barcode</span>
            <div className="flex gap-2">
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(event) => {
                  setBarcode(event.target.value);
                  setNotFound(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    lookupBarcode(barcode);
                  }
                }}
                placeholder="Scan or type barcode"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  barcodeRef.current?.focus();
                  lookupBarcode(barcode);
                }}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13px] font-semibold text-navy transition hover:bg-[#f8fafc]"
              >
                <ScanLine className="h-4 w-4" strokeWidth={1.8} />
                Scan
              </button>
            </div>
            {notFound ? (
              <div className="mt-2 rounded-[12px] bg-[#f6eaea] px-3 py-2.5">
                <p className="text-[13px] font-medium text-[#8a5a5a]">Product not found.</p>
                <button
                  type="button"
                  onClick={() => onCreateProduct(barcode.trim())}
                  className="mt-1 text-[13px] font-semibold text-navy underline-offset-2 hover:underline"
                >
                  Create Product
                </button>
              </div>
            ) : null}
          </div>

          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Select Product</span>
            <input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search / Select Product"
              className={inputClass}
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-[14px] border border-black/[0.06]">
              {matches.length === 0 ? (
                <p className="px-3 py-3 text-[13px] text-slate-500">No matching products.</p>
              ) : (
                matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectProduct(item)}
                    className={cn(
                      "flex w-full flex-col px-3 py-2.5 text-left hover:bg-slate-50",
                      selectedId === item.id && "bg-[#f5f8fc]",
                    )}
                  >
                    <span className="text-[13px] font-semibold text-navy">{item.name}</span>
                    <span className="text-[12px] text-slate-500">
                      {item.sku} · {item.barcode || "No barcode"}
                    </span>
                  </button>
                ))
              )}
            </div>
            {errors.product ? <p className="mt-1.5 text-[12px] text-[#8a5a5a]">{errors.product}</p> : null}
          </div>
        </div>
      </section>

      {selected ? (
        <section className="rounded-[16px] bg-[#f8fafc] px-4 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Product Master</p>
          <h3 className="mt-2 text-[18px] font-bold tracking-[-0.03em] text-navy">{selected.name}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <div>
              <dt className="text-slate-500">SKU</dt>
              <dd className="font-medium text-navy">{selected.sku}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Barcode</dt>
              <dd className="font-medium text-navy">{selected.barcode || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Category</dt>
              <dd className="font-medium text-navy">{selected.category}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Unit</dt>
              <dd className="font-medium text-navy">{selected.unit}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Selling price</dt>
              <dd className="font-medium text-navy">{formatTzs(selected.sellingPrice)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Current stock</dt>
              <dd className="font-medium text-navy">{currentStockFor(selected.id, batches)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Receiving
        </h3>
        <div className="mt-3 space-y-3">
          <Field label="Quantity Received" required error={errors.quantity}>
            <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Batch Number">
            <input value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder="Auto if empty" className={inputClass} />
          </Field>
          {selected?.trackExpiry ? (
            <Field label="Expiry Date" required error={errors.expiryDate}>
              <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className={inputClass} />
            </Field>
          ) : null}
          <Field label="Buying Price" required error={errors.buyingPrice}>
            <input inputMode="numeric" value={buyingPrice} onChange={(event) => setBuyingPrice(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Supplier">
            <input value={supplier} onChange={(event) => setSupplier(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Received Date" required error={errors.receivedAt}>
            <input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
          Cancel
        </button>
        <button type="submit" className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white">
          Receive Stock
        </button>
      </div>
    </form>
  );
}

function StockDetails({
  product,
  batches,
  canReceive,
  onAddStock,
}: {
  product: SupermarketProduct & { stock: number };
  batches: ReturnType<typeof batchesForProduct>;
  canReceive: boolean;
  onAddStock: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[16px] bg-[#f8fafc] px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total Stock</p>
        <h3 className="mt-2 text-[20px] font-bold tracking-[-0.03em] text-navy">{product.name}</h3>
        <p className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-navy">{product.stock} units</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StockStatusBadge status={stockStatusForLocal(product.stock, product.reorderLevel)} />
          {product.isActive ? null : <InactiveBadge />}
        </div>
      </section>

      <dl className="space-y-3 text-[13.5px]">
        <DetailRow label="SKU" value={product.sku} />
        <DetailRow label="Barcode" value={product.barcode || "—"} />
        <DetailRow label="Category" value={product.category} />
        <DetailRow label="Unit" value={product.unit} />
        <DetailRow label="Selling price" value={formatTzs(product.sellingPrice)} />
        <DetailRow label="Reorder level" value={String(product.reorderLevel)} />
        <DetailRow label="Track expiry" value={product.trackExpiry ? "On" : "Off"} />
      </dl>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Stock Batches</h3>
        {batches.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No batches on hand for this product.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-[16px] border border-black/[0.04]">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f8fafc] text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 font-medium">Quantity</th>
                  <th className="px-4 py-2.5 font-medium">Expiry</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const status = batchExpiryStatus(batch.expiryDate);
                  return (
                    <tr key={batch.id} className="border-t border-black/4">
                      <td className="px-4 py-3 font-medium text-navy">{batch.batchNumber}</td>
                      <td className="px-4 py-3 text-navy">{batch.quantity}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDisplayDate(batch.expiryDate)}</td>
                      <td className="px-4 py-3">
                        <ExpiryBadge status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canReceive ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddStock}
            className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white"
          >
            Add Stock
          </button>
        </div>
      ) : null}
    </div>
  );
}

function stockStatusForLocal(stock: number, reorderLevel: number): StockStatus {
  if (stock <= 0) return "Out of Stock";
  if (stock <= reorderLevel) return "Low Stock";
  return "In Stock";
}

function StockHistoryPanel({
  product,
  movements,
}: {
  product: SupermarketProduct;
  movements: Array<{
    id: string;
    date: string;
    type: "Opening Stock" | "Received" | "Sale" | "Adjustment";
    quantity: number;
    balance: number;
    reference: string;
    note: string;
  }>;
}) {
  const rows = [...movements].reverse();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-semibold text-navy">{product.name}</p>
        <p className="mt-1 text-[13px] text-slate-500">
          Mock stock movements for this product. POS and Purchases will write here later.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-500">No movements recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-black/[0.04]">
          <table className="min-w-full text-left text-[13px]">
            <thead className="bg-[#f8fafc] text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Qty</th>
                <th className="px-4 py-2.5 font-medium">Balance</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-t border-black/4">
                  <td className="px-4 py-3 text-slate-500">
                    <p>{formatDisplayDate(item.date)}</p>
                    {item.note ? <p className="mt-0.5 text-[11px]">{item.note}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-navy">{movementTypeLabel(item.type)}</td>
                  <td className={cn("px-4 py-3 font-semibold", item.quantity < 0 ? "text-[#8a5a5a]" : "text-[#5a7a64]")}>
                    {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                  </td>
                  <td className="px-4 py-3 font-semibold text-navy">{item.balance}</td>
                  <td className="px-4 py-3 text-slate-500">{item.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-500">
        {label}
        {required ? <span className="text-[#8a5a5a]"> *</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-[12px] text-[#8a5a5a]">{error}</span> : null}
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[148px_1fr] sm:gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}
