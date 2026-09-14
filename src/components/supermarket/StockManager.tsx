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
import { useAuth } from "@/components/auth/AuthProvider";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type { AuthUser } from "@/lib/auth/types";
import {
  EXPIRING_SOON_DAYS,
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
  stockStatusFor,
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
type MovementRow = ReturnType<typeof movementsForProduct>[number];

const glass =
  "rounded-[22px] border border-white/75 bg-white/72 shadow-[0_12px_40px_rgba(15,35,64,0.045)] backdrop-blur-xl";
const selectClass =
  "h-11 w-full rounded-[16px] border border-black/[0.05] bg-white/65 px-3.5 text-[13.5px] text-navy outline-none backdrop-blur-sm transition focus:border-navy/15 focus:bg-white/90";
const inputClass =
  "h-11 w-full rounded-[16px] border border-black/[0.05] bg-white/65 px-3.5 text-[13.5px] text-navy outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-navy/15 focus:bg-white/90";

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
  const attention = useMemo(
    () => inventoryAttention(inventory.products, inventory.batches),
    [inventory.products, inventory.batches],
  );
  const health = useMemo(() => {
    const total = rows.length || 1;
    const inStock = rows.filter((item) => item.stockStatus === "In Stock").length;
    const lowStock = rows.filter((item) => item.stockStatus === "Low Stock").length;
    const outOfStock = rows.filter((item) => item.stockStatus === "Out of Stock").length;
    return { total, inStock, lowStock, outOfStock };
  }, [rows]);
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
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Stock</h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-6 text-slate-500">
            Inventory control, stock levels, batches and expiry tracking.
          </p>
        </div>
        {canReceive ? (
          <button
            type="button"
            onClick={() => openAdd()}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[16px] bg-navy px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(15,35,64,0.18)] transition hover:bg-[#132844] sm:w-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Add Stock
          </button>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Products" value={String(kpis.totalProducts)} hint="Active catalogue" icon={Package} />
        <KpiCard label="Total Stock Units" value={String(kpis.totalStockUnits)} hint="Current units" icon={Warehouse} />
        <KpiCard label="Low Stock" value={String(kpis.lowStock)} hint="Need attention" icon={AlertTriangle} />
        <KpiCard label="Out of Stock" value={String(kpis.outOfStock)} hint="Zero available units" icon={Ban} />
        <KpiCard
          label="Expiring Soon"
          value={String(kpis.expiringSoonUnits)}
          hint={`Units within ${EXPIRING_SOON_DAYS} days`}
          icon={Clock3}
        />
        <KpiCard label="Expired" value={String(kpis.expiredUnits)} hint="Require action" icon={TimerReset} />
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <article className={cn(glass, "px-4 py-4 sm:px-5 sm:py-5")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Inventory Attention
          </p>
          <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-navy">Expiring Soon</h2>
          <p className="mt-1 text-[13.5px] leading-6 text-slate-500">
            {kpis.expiringSoonUnits} units expiring within {EXPIRING_SOON_DAYS} days
          </p>
          <p className="text-[13px] text-slate-500">
            {kpis.expiringSoonProducts} product{kpis.expiringSoonProducts === 1 ? "" : "s"} require attention
          </p>

          <div className="mt-4 divide-y divide-black/[0.04]">
            {attention.soon.length === 0 ? (
              <p className="py-3 text-[13px] text-slate-500">No batches are approaching expiry.</p>
            ) : (
              attention.soon.map((item) => (
                <button
                  key={`${item.productId}-${item.expiryDate}`}
                  type="button"
                  onClick={() => openView(item.productId)}
                  className="flex w-full items-baseline justify-between gap-3 py-3 text-left transition hover:opacity-80"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold tracking-[-0.02em] text-navy">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-slate-500">{item.units} units</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-slate-500">{formatDisplayDate(item.expiryDate)}</span>
                </button>
              ))
            )}
          </div>

          {kpis.expiredUnits > 0 ? (
            <p className="mt-3 border-t border-black/[0.04] pt-3 text-[13.5px] font-medium text-navy">
              {kpis.expiredUnits} units already expired
            </p>
          ) : null}
        </article>

        <article className={cn(glass, "px-4 py-4 sm:px-5 sm:py-5")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Inventory Overview
          </p>
          <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-navy">Health</h2>
          <div className="mt-5 space-y-4">
            <HealthRow label="In Stock" count={health.inStock} total={health.total} />
            <HealthRow label="Low Stock" count={health.lowStock} total={health.total} />
            <HealthRow label="Out of Stock" count={health.outOfStock} total={health.total} />
          </div>
        </article>
      </section>

      <section className={cn(glass, "p-3 sm:p-4")}>
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
      </section>

      {visible.length === 0 ? (
        <EmptyStock filtersActive={filtersActive} onClear={clearFilters} />
      ) : (
        <>
          <section className={cn(glass, "hidden overflow-hidden xl:block")}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Product</th>
                    <th className="px-5 py-3.5 font-medium">SKU</th>
                    <th className="px-5 py-3.5 font-medium">Category</th>
                    <th className="px-5 py-3.5 font-medium">Current Stock</th>
                    <th className="px-5 py-3.5 font-medium">Reorder Level</th>
                    <th className="px-5 py-3.5 font-medium">Stock Status</th>
                    <th className="px-5 py-3.5 font-medium">Expiry</th>
                    <th className="px-5 py-3.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
                    <tr key={product.id} className="border-t border-black/[0.035]">
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => openView(product.id)} className="text-left">
                          <p className="font-semibold tracking-[-0.02em] text-navy">{product.name}</p>
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {product.unit}
                            {product.isActive ? "" : " · Inactive"}
                          </p>
                        </button>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{product.sku}</td>
                      <td className="px-5 py-4 text-slate-500">{product.category}</td>
                      <td className="px-5 py-4 text-[15px] font-semibold tracking-[-0.03em] text-navy">{product.stock}</td>
                      <td className="px-5 py-4 text-slate-500">{product.reorderLevel}</td>
                      <td className="px-5 py-4">
                        <StatusLabel value={product.stockStatus} />
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {productExpirySummary(product.id, inventory.batches, product.stock)}
                      </td>
                      <td className="px-5 py-4">
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
          </section>

          <section className={cn(glass, "hidden overflow-hidden md:block xl:hidden")}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5 font-medium">Product</th>
                    <th className="px-4 py-3.5 font-medium">Stock</th>
                    <th className="px-4 py-3.5 font-medium">Status</th>
                    <th className="px-4 py-3.5 font-medium">Expiry</th>
                    <th className="px-4 py-3.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
                    <tr key={product.id} className="border-t border-black/[0.035]">
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => openView(product.id)} className="text-left">
                          <p className="font-semibold tracking-[-0.02em] text-navy">{product.name}</p>
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {product.sku} · {product.category}
                          </p>
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[15px] font-semibold tracking-[-0.03em] text-navy">{product.stock}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">ROP {product.reorderLevel}</p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusLabel value={product.stockStatus} />
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {productExpirySummary(product.id, inventory.batches, product.stock)}
                      </td>
                      <td className="px-4 py-4">
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
          </section>

          <div className="space-y-2.5 md:hidden">
            {visible.map((product) => (
              <article key={product.id} className={cn(glass, "px-4 py-4")}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => openView(product.id)} className="min-w-0 text-left">
                    <p className="font-semibold tracking-[-0.02em] text-navy">{product.name}</p>
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
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[16px] font-semibold tracking-[-0.03em] text-navy">{product.stock} units</span>
                  <StatusLabel value={product.stockStatus} />
                  {product.isActive ? null : <span className="text-[12.5px] text-slate-400">Inactive</span>}
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
        <StockDrawer kicker="Inventory" title="Add Stock" onClose={closePanel}>
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
        <StockDrawer kicker="Product Master" title="View Stock" onClose={closePanel}>
          <StockDetails
            product={selected}
            batches={batchesForProduct(selected.id, inventory.batches)}
            movements={movementsForProduct(selected.id, inventory.movements)}
            canReceive={canReceive}
            onAddStock={() => openAdd(selected.id)}
          />
        </StockDrawer>
      ) : null}

      {drawer === "history" && selected ? (
        <StockDrawer kicker="Movements" title="Stock History" onClose={closePanel}>
          <StockHistoryPanel
            product={selected}
            movements={movementsForProduct(selected.id, inventory.movements)}
          />
        </StockDrawer>
      ) : null}
    </div>
  );
}

function inventoryAttention(products: SupermarketProduct[], batches: StockBatch[]) {
  const soon = batches
    .filter((batch) => batch.quantity > 0 && batchExpiryStatus(batch.expiryDate) === "Expiring Soon")
    .slice()
    .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""))
    .slice(0, 3)
    .map((batch) => ({
      productId: batch.productId,
      name: products.find((item) => item.id === batch.productId)?.name ?? "Unknown product",
      units: batch.quantity,
      expiryDate: batch.expiryDate as string,
    }));
  return { soon };
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
    <div className={cn(glass, "px-6 py-16 text-center")}>
      <p className="text-[16px] font-semibold tracking-[-0.03em] text-navy">No inventory found</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {filtersActive
          ? "Nothing matches the current search or filters."
          : "Receive stock against a product from the catalogue to start inventory."}
      </p>
      {filtersActive ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[16px] bg-navy px-4 text-[14px] font-semibold text-white"
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
    <article className={cn(glass, "flex min-w-0 items-start gap-3 px-3.5 py-3.5 sm:min-h-[108px] sm:px-4 sm:py-4")}>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-navy/[0.05] text-navy/70 sm:h-10 sm:w-10">
        <Icon className="h-4 w-4" strokeWidth={1.55} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.01em] text-slate-500 sm:text-[12px]">{label}</p>
        <p className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-navy sm:text-[26px]">{value}</p>
        <p className="mt-1 text-[11.5px] leading-4 text-slate-400">{hint}</p>
      </div>
    </article>
  );
}

function HealthRow({ label, count, total }: { label: string; count: number; total: number }) {
  const width = Math.round((count / Math.max(total, 1)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13.5px] font-medium text-navy">{label}</p>
        <p className="text-[15px] font-semibold tracking-[-0.03em] text-navy">{count}</p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.05]">
        <div className="h-full rounded-full bg-navy/35 transition-[width] duration-300" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function StatusLabel({ value }: { value: string }) {
  const strong = value === "Low Stock" || value === "Out of Stock" || value === "Expiring Soon" || value === "Expired";
  return (
    <span className={cn("text-[12.5px] tracking-[-0.01em]", strong ? "font-semibold text-navy" : "font-medium text-slate-500")}>
      {value}
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
            className="fixed z-[80] w-44 overflow-hidden rounded-[16px] border border-white/80 bg-white/90 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-400 transition hover:bg-navy/[0.05] hover:text-navy"
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
      className="flex w-full px-3 py-2.5 text-left text-[13px] text-navy hover:bg-navy/[0.04]"
    >
      {label}
    </button>
  );
}

function StockDrawer({
  kicker,
  title,
  onClose,
  children,
}: {
  kicker?: string;
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
      <button
        type="button"
        className="absolute inset-0 bg-navy/20 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[540px] flex-col border-l border-white/70 bg-white/82 shadow-[-24px_0_60px_rgba(15,35,64,0.12)] backdrop-blur-[28px]">
        <div className="flex items-start justify-between px-5 py-5">
          <div>
            {kicker ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{kicker}</p>
            ) : null}
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-navy">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-navy/[0.04] text-slate-500 hover:text-navy"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">{children}</div>
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
      className="space-y-7"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <section>
        <p className="text-[12px] font-medium text-slate-500">Scan or enter barcode</p>
        <div className="mt-2 flex gap-2">
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
            placeholder="Scan or enter barcode..."
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => {
              barcodeRef.current?.focus();
              lookupBarcode(barcode);
            }}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[16px] border border-black/[0.05] bg-white/70 px-3.5 text-[13px] font-semibold text-navy transition hover:bg-white"
          >
            <ScanLine className="h-4 w-4" strokeWidth={1.8} />
            Scan
          </button>
        </div>
        {notFound ? (
          <div className="mt-3 rounded-[16px] border border-black/[0.04] bg-white/60 px-3.5 py-3">
            <p className="text-[13px] font-medium text-navy">Product not found.</p>
            <button
              type="button"
              onClick={() => onCreateProduct(barcode.trim())}
              className="mt-1 text-[13px] font-semibold text-navy underline-offset-2 hover:underline"
            >
              Create Product
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <p className="text-[12px] font-medium text-slate-500">or Select Product</p>
        <input
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
          placeholder="Search product..."
          className={cn(inputClass, "mt-2")}
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-[16px] border border-black/[0.04] bg-white/50">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-slate-500">No matching products.</p>
          ) : (
            matches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectProduct(item)}
                className={cn(
                  "flex w-full flex-col px-3.5 py-2.5 text-left transition hover:bg-white/80",
                  selectedId === item.id && "bg-white/90",
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
        {errors.product ? <p className="mt-1.5 text-[12px] text-slate-500">{errors.product}</p> : null}
      </section>

      {selected ? (
        <section className="rounded-[18px] border border-white/80 bg-white/55 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Selected product</p>
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-navy">{selected.name}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <ReadOnlyField label="SKU" value={selected.sku} />
            <ReadOnlyField label="Barcode" value={selected.barcode || "—"} />
            <ReadOnlyField label="Category" value={selected.category} />
            <ReadOnlyField label="Unit" value={selected.unit} />
            <ReadOnlyField label="Selling price" value={formatTzs(selected.sellingPrice)} />
            <ReadOnlyField label="Current stock" value={String(currentStockFor(selected.id, batches))} />
          </dl>
        </section>
      ) : null}

      <section className="space-y-3">
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
      </section>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-11 rounded-[16px] px-4 text-[14px] font-medium text-slate-500">
          Cancel
        </button>
        <button type="submit" className="h-11 rounded-[16px] bg-navy px-5 text-[14px] font-semibold text-white">
          Receive Stock
        </button>
      </div>
    </form>
  );
}

function StockDetails({
  product,
  batches,
  movements,
  canReceive,
  onAddStock,
}: {
  product: SupermarketProduct & { stock: number };
  batches: ReturnType<typeof batchesForProduct>;
  movements: MovementRow[];
  canReceive: boolean;
  onAddStock: () => void;
}) {
  const recent = [...movements].reverse().slice(0, 5);
  return (
    <div className="space-y-7">
      <section>
        <h3 className="text-[22px] font-semibold tracking-[-0.04em] text-navy">{product.name}</h3>
        <p className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-navy">{product.stock} units</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
          <StatusLabel value={stockStatusFor(product.stock, product.reorderLevel)} />
          {product.isActive ? null : <span>Inactive</span>}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
        <ReadOnlyField label="SKU" value={product.sku} />
        <ReadOnlyField label="Barcode" value={product.barcode || "—"} />
        <ReadOnlyField label="Category" value={product.category} />
        <ReadOnlyField label="Unit" value={product.unit} />
        <ReadOnlyField label="Selling price" value={formatTzs(product.sellingPrice)} />
        <ReadOnlyField label="Reorder level" value={String(product.reorderLevel)} />
      </dl>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Stock Breakdown</p>
        {batches.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No batches on hand for this product.</p>
        ) : (
          <div className="mt-3 divide-y divide-black/[0.04]">
            {batches.map((batch) => {
              const status = batchExpiryStatus(batch.expiryDate);
              return (
                <div key={batch.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 sm:grid-cols-[88px_1fr_auto_auto]">
                  <p className="font-semibold text-navy">{batch.batchNumber}</p>
                  <p className="text-[13px] text-slate-500 sm:text-navy">{batch.quantity} units</p>
                  <p className="text-[13px] text-slate-500">{formatDisplayDate(batch.expiryDate)}</p>
                  <StatusLabel value={status} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Stock History</p>
        {recent.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No movements recorded yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-black/[0.04]">
            {recent.map((item) => (
              <div key={item.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-navy">{movementTypeLabel(item.type)}</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">
                    {formatDisplayDate(item.date)} · {item.reference}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] font-semibold text-navy">
                  {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {canReceive ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddStock}
            className="h-11 rounded-[16px] bg-navy px-5 text-[14px] font-semibold text-white"
          >
            Add Stock
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StockHistoryPanel({
  product,
  movements,
}: {
  product: SupermarketProduct;
  movements: MovementRow[];
}) {
  const rows = [...movements].reverse();
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{product.name}</p>
        <p className="mt-1 text-[13px] text-slate-500">Date, movement type, quantity, balance and reference.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-500">No movements recorded yet.</p>
      ) : (
        <div className="divide-y divide-black/[0.04]">
          {rows.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 sm:grid-cols-[140px_1fr_70px_70px]">
              <p className="text-[13px] text-slate-500">{formatDisplayDate(item.date)}</p>
              <div>
                <p className="text-[13px] font-medium text-navy">{movementTypeLabel(item.type)}</p>
                <p className="mt-0.5 text-[12px] text-slate-400">{item.reference}</p>
              </div>
              <p className="text-[13px] font-semibold text-navy">
                {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
              </p>
              <p className="text-[13px] font-semibold text-navy">{item.balance}</p>
            </div>
          ))}
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
        {required ? " *" : ""}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-[12px] text-slate-500">{error}</span> : null}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy">{value}</dd>
    </div>
  );
}
