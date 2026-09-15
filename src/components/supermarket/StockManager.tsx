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
  "rounded-[24px] border border-white/70 bg-white/74 shadow-[0_10px_32px_rgba(15,35,64,0.045)] backdrop-blur-xl";
const filterClass =
  "h-9 w-full rounded-full border border-white/80 bg-white/78 px-3.5 text-[13px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.04)] outline-none backdrop-blur-md transition focus:border-navy/10 focus:bg-white";
const inputClass =
  "h-10 w-full rounded-[14px] border border-white/80 bg-white/70 px-3 text-[13px] text-navy outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-navy/12 focus:bg-white/90";
const PAGE_SIZES = [10, 20, 50] as const;

type KpiTone = "blue" | "green" | "amber" | "rose" | "violet" | "pink";

const KPI_TONES: Record<KpiTone, { card: string; icon: string }> = {
  blue: {
    card: "border-sky-200/35 bg-[#eef5ff]/78",
    icon: "bg-sky-100/80 text-sky-700",
  },
  green: {
    card: "border-emerald-200/35 bg-[#eefaf2]/78",
    icon: "bg-emerald-100/80 text-emerald-700",
  },
  amber: {
    card: "border-amber-200/40 bg-[#fff8eb]/82",
    icon: "bg-amber-100/80 text-amber-600",
  },
  rose: {
    card: "border-rose-200/40 bg-[#fff1f2]/80",
    icon: "bg-rose-100/80 text-rose-600",
  },
  violet: {
    card: "border-violet-200/40 bg-[#f4f1ff]/82",
    icon: "bg-violet-100/80 text-violet-600",
  },
  pink: {
    card: "border-rose-200/30 bg-[#fff4f1]/80",
    icon: "bg-rose-100/70 text-rose-500",
  },
};

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);

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

  useEffect(() => {
    setPage(1);
  }, [query, category, status, expiry, sort, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = visible.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, visible.length);

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
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Stock</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
            Manage inventory levels, batches, expiry dates and stock movements.
          </p>
        </div>
        {canReceive ? (
          <button
            type="button"
            onClick={() => openAdd()}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)] transition hover:bg-[#102a52] sm:w-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Add Stock
          </button>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Products" value={String(kpis.totalProducts)} hint="Active catalogue" icon={Package} tone="blue" />
        <KpiCard label="Total Stock Units" value={String(kpis.totalStockUnits)} hint="Across all products" icon={Warehouse} tone="green" />
        <KpiCard label="Low Stock" value={String(kpis.lowStock)} hint="Need attention" icon={AlertTriangle} tone="amber" />
        <KpiCard label="Out of Stock" value={String(kpis.outOfStock)} hint="Zero available" icon={Ban} tone="rose" />
        <KpiCard
          label="Expiring Soon"
          value={String(kpis.expiringSoonUnits)}
          hint={`Units within ${EXPIRING_SOON_DAYS} days`}
          icon={Clock3}
          tone="violet"
        />
        <KpiCard label="Expired" value={String(kpis.expiredUnits)} hint="Require action" icon={TimerReset} tone="pink" />
      </section>

      <section className={cn(glass, "overflow-hidden")}>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <label className="relative block min-w-0 flex-1 lg:min-w-[220px]">
            <span className="sr-only">Search stock</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, SKU, barcode..."
              className={cn(filterClass, "pl-9")}
            />
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className={cn(filterClass, "lg:w-auto lg:min-w-[148px]")}>
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
            className={cn(filterClass, "lg:w-auto lg:min-w-[148px]")}
          >
            <option value="all">All Stock Status</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
          <select
            value={expiry}
            onChange={(event) => setExpiry(event.target.value as ExpiryFilter)}
            className={cn(filterClass, "lg:w-auto lg:min-w-[148px]")}
          >
            <option value="all">All Expiry Status</option>
            <option value="No Expiry">No Expiry</option>
            <option value="Normal">Normal</option>
            <option value="Expiring Soon">Expiring Soon</option>
            <option value="Expired">Expired</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as StockSort)} className={cn(filterClass, "lg:w-auto lg:min-w-[136px]")}>
            <option value="name">Product A-Z</option>
            <option value="stock-low">Lowest Stock</option>
            <option value="stock-high">Highest Stock</option>
            <option value="expiry">Earliest Expiry</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <EmptyStock filtersActive={filtersActive} onClear={clearFilters} />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full text-left text-[13px]">
                <thead className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">SKU</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Current Stock</th>
                    <th className="px-4 py-2.5 font-medium">Reorder Level</th>
                    <th className="px-4 py-2.5 font-medium">Stock Status</th>
                    <th className="px-4 py-2.5 font-medium">Expiry</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((product) => (
                    <tr key={product.id} className="border-t border-black/[0.04]">
                      <td className="px-4 py-3">
                        <ProductName
                          product={product}
                          onOpen={() => openView(product.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-400">{product.sku}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-500">{product.category}</td>
                      <td className="px-4 py-3 text-[14px] font-semibold tracking-[-0.03em] text-navy">{product.stock}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-500">{product.reorderLevel}</td>
                      <td className="px-4 py-3">
                        <StatusLabel value={product.stockStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <ExpiryCell productId={product.id} batches={inventory.batches} />
                      </td>
                      <td className="px-4 py-3">
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

            <div className="hidden overflow-x-auto md:block xl:hidden">
              <table className="min-w-full text-left text-[13px]">
                <thead className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 font-medium">Product</th>
                    <th className="px-3.5 py-2.5 font-medium">Stock</th>
                    <th className="px-3.5 py-2.5 font-medium">Status</th>
                    <th className="px-3.5 py-2.5 font-medium">Expiry</th>
                    <th className="px-3.5 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((product) => (
                    <tr key={product.id} className="border-t border-black/[0.04]">
                      <td className="px-3.5 py-3">
                        <ProductName product={product} onOpen={() => openView(product.id)} />
                      </td>
                      <td className="px-3.5 py-3">
                        <p className="text-[14px] font-semibold tracking-[-0.03em] text-navy">{product.stock}</p>
                        <p className="text-[11px] text-slate-400">ROP {product.reorderLevel}</p>
                      </td>
                      <td className="px-3.5 py-3">
                        <StatusLabel value={product.stockStatus} />
                      </td>
                      <td className="px-3.5 py-3">
                        <ExpiryCell productId={product.id} batches={inventory.batches} />
                      </td>
                      <td className="px-3.5 py-3">
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

            <div className="space-y-2 px-3 pb-3 md:hidden">
              {pageRows.map((product) => (
                <article key={product.id} className="rounded-[16px] border border-white/70 bg-white/55 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <ProductName product={product} onOpen={() => openView(product.id)} />
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
                  <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[14px] font-semibold tracking-[-0.03em] text-navy">{product.stock} units</span>
                    <StatusLabel value={product.stockStatus} />
                    {product.isActive ? null : <span className="text-[12px] text-slate-400">Inactive</span>}
                  </div>
                  <div className="mt-1.5">
                    <ExpiryCell productId={product.id} batches={inventory.batches} />
                  </div>
                </article>
              ))}
            </div>

            <Pagination
              from={from}
              to={to}
              total={visible.length}
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(size) => setPageSize(size)}
            />
          </>
        )}
      </section>

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
    <div className="px-6 py-10 text-center">
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
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: KpiTone;
}) {
  const accent = KPI_TONES[tone];
  return (
    <article
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-[22px] border px-3.5 py-3 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl sm:px-4 sm:py-3.5",
        accent.card,
      )}
    >
      <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px]", accent.icon)}>
        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[22px] font-semibold tracking-[-0.045em] text-navy sm:text-[24px]">{value}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{hint}</p>
      </div>
    </article>
  );
}

function ProductName({
  product,
  onOpen,
}: {
  product: SupermarketProduct;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className="min-w-0 text-left">
      <span className="block truncate text-[13.5px] font-semibold tracking-[-0.02em] text-navy">
        {product.name}
      </span>
      <span className="mt-0.5 block truncate text-[11.5px] text-slate-400">
        {product.barcode || product.sku}
        {product.isActive ? "" : " · Inactive"}
      </span>
    </button>
  );
}

function ExpiryCell({ productId, batches }: { productId: string; batches: StockBatch[] }) {
  const rows = batchesForProduct(productId, batches);
  const dated = rows.filter((batch) => batch.expiryDate);
  const expired = dated
    .filter((batch) => batch.quantity > 0 && batchExpiryStatus(batch.expiryDate) === "Expired")
    .map((batch) => batch.expiryDate as string)
    .sort();
  const liveDated = dated.filter((batch) => batch.quantity > 0);
  const next = liveDated.map((batch) => batch.expiryDate as string).sort()[0] ?? dated.map((batch) => batch.expiryDate as string).sort()[0];

  if (expired.length) {
    return (
      <div>
        <p className="text-[12.5px] font-semibold text-[#b42318]">Expired</p>
        <p className="mt-0.5 text-[11.5px] text-[#b42318]/80">{formatDisplayDate(expired[0])}</p>
      </div>
    );
  }
  if (liveDated.length) {
    return (
      <div>
        <p className="text-[12.5px] font-medium text-navy">
          {liveDated.length} batch{liveDated.length === 1 ? "" : "es"}
        </p>
        <p className="mt-0.5 text-[11.5px] text-slate-400">Next: {formatDisplayDate(next)}</p>
      </div>
    );
  }
  return <p className="text-[12.5px] text-slate-400">No Expiry</p>;
}

function StatusLabel({ value }: { value: string }) {
  const tone =
    value === "In Stock"
      ? "bg-emerald-50/90 text-emerald-800"
      : value === "Low Stock"
        ? "bg-amber-50/90 text-amber-800"
        : value === "Out of Stock" || value === "Expired"
          ? "bg-rose-50/90 text-rose-800"
          : value === "Expiring Soon"
            ? "bg-violet-50/90 text-violet-800"
            : "bg-slate-50/90 text-slate-600";
  const dot =
    value === "In Stock"
      ? "bg-emerald-500"
      : value === "Low Stock"
        ? "bg-amber-400"
        : value === "Out of Stock" || value === "Expired"
          ? "bg-rose-500"
          : value === "Expiring Soon"
            ? "bg-violet-500"
            : "bg-slate-400";

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium tracking-[-0.01em]", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {value}
    </span>
  );
}

function Pagination({
  from,
  to,
  total,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: (typeof PAGE_SIZES)[number]) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-black/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        Showing {from} to {to} of {total} products
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-400 shadow-[0_1px_2px_rgba(15,35,64,0.04)] transition hover:bg-white hover:text-navy disabled:opacity-30"
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#0b2244] px-2 text-[12.5px] font-semibold text-white shadow-[0_4px_10px_rgba(11,34,68,0.16)]">
            {page}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-400 shadow-[0_1px_2px_rgba(15,35,64,0.04)] transition hover:bg-white hover:text-navy disabled:opacity-30"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}
          className="h-8 rounded-full border border-white/80 bg-white/75 px-2.5 text-[12px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.04)] outline-none"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
      </div>
    </div>
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-400 shadow-[0_1px_2px_rgba(15,35,64,0.04)] transition hover:bg-white hover:text-navy"
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
