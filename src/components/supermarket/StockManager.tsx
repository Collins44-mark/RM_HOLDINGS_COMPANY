"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
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
import { CategoryCreateModal, CategoryDropdownActions, ADD_CATEGORY_OPTION, MANAGE_CATEGORIES_OPTION, canCreateSupermarketCategory, canManageSupermarketCategories } from "@/components/supermarket/CategoryCreateModal";
import { CategoryManageModal } from "@/components/supermarket/CategoryManageModal";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type { AuthUser } from "@/lib/auth/types";
import {
  EXPIRING_SOON_DAYS,
  STOCK_MOVEMENT_FILTERS,
  adjustmentDelta,
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
  productHasExpiryStatus,
  productMatchesKpiFocus,
  rememberNewProductBarcode,
  stockMovementKindLabel,
  stockStatusFor,
  useSupermarketInventory,
  type AdjustStockInput,
  type ExpiryStatus,
  type InventoryKpiFocus,
  type StockAdjustmentKind,
  type StockBatch,
  type StockMovement,
  type StockMovementFilter,
  type StockStatus,
  type SupermarketProduct,
} from "@/lib/data/supermarket-inventory";

type StockStatusFilter = "all" | StockStatus;
type ExpiryFilter = "all" | ExpiryStatus;
type StockSort = "name" | "stock-low" | "stock-high" | "expiry";
type DrawerMode = "add" | "adjust" | "view" | "history" | null;
type MovementRow = ReturnType<typeof movementsForProduct>[number];

const KPI_CHIP_LABEL: Record<Exclude<InventoryKpiFocus, "all" | "units">, string> = {
  low: "Low Stock",
  out: "Out of Stock",
  soon: "Expiring Soon",
  expired: "Expired",
};

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";
const filterClass =
  "h-10 w-full min-w-0 rounded-full border border-white/70 bg-white/82 px-3.5 text-[13px] text-navy shadow-[0_6px_18px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-xl transition duration-200 focus:border-white focus:bg-white";
const inputClass =
  "h-10 w-full rounded-[14px] border border-white/80 bg-white/70 px-3 text-[13px] text-navy outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-navy/12 focus:bg-white/90";
const PAGE_SIZES = [10, 20, 50] as const;
const tableHead =
  "bg-[#e8eef5]/72 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400 backdrop-blur-md";
const tableRow = "border-t border-[#d5dee8]/80";

type KpiTone = "blue" | "green" | "amber" | "rose" | "violet" | "pink";

const KPI_TONES: Record<KpiTone, { card: string; icon: string }> = {
  blue: {
    card: "border-white/70 bg-[#f4f8ff]/72",
    icon: "border-sky-100/80 bg-sky-50/90 text-sky-600",
  },
  green: {
    card: "border-white/70 bg-[#eefaf3]/70",
    icon: "border-emerald-100/80 bg-emerald-50/90 text-emerald-600",
  },
  amber: {
    card: "border-white/70 bg-[#fff8eb]/74",
    icon: "border-amber-100/80 bg-amber-50/90 text-amber-500",
  },
  rose: {
    card: "border-white/70 bg-[#fff2f3]/72",
    icon: "border-rose-100/80 bg-rose-50/90 text-rose-500",
  },
  violet: {
    card: "border-white/70 bg-[#f5f2ff]/74",
    icon: "border-violet-100/80 bg-violet-50/90 text-violet-500",
  },
  pink: {
    card: "border-white/70 bg-[#fff4f1]/72",
    icon: "border-rose-100/70 bg-rose-50/85 text-rose-400",
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
  const canAddCategory = canCreateSupermarketCategory(user, isSuperAdmin());
  const canManageCategories = canManageSupermarketCategories(user, isSuperAdmin());
  const inventory = useSupermarketInventory();
  const categories = inventory.categories.map((item) => item.name);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StockStatusFilter>("all");
  const [expiry, setExpiry] = useState<ExpiryFilter>("all");
  const [kpiFocus, setKpiFocus] = useState<InventoryKpiFocus>("all");
  const [sort, setSort] = useState<StockSort>("name");
  const [workspace, setWorkspace] = useState<"inventory" | "movements">("inventory");
  const [layout, setLayout] = useState<"cards" | "compact" | "table">("table");
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefillProductId, setPrefillProductId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);

  const rows = useMemo(
    () => inventory.products.map((product) => attachStock(product, inventory.batches)),
    [inventory.products, inventory.batches],
  );
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const kpis = useMemo(() => inventoryKpis(inventory), [inventory]);
  const kpiChip = kpiFocus === "all" || kpiFocus === "units" ? null : KPI_CHIP_LABEL[kpiFocus];
  const filtersActive =
    Boolean(query.trim()) ||
    category !== "all" ||
    status !== "all" ||
    expiry !== "all" ||
    Boolean(kpiChip);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((product) => {
      if (!productMatchesKpiFocus(product, inventory.batches, kpiFocus)) return false;
      if (category !== "all" && product.category !== category) return false;
      if (status !== "all" && product.stockStatus !== status) return false;
      if (expiry !== "all") {
        if (expiry === "Expiring Soon" || expiry === "Expired") {
          if (!productHasExpiryStatus(product.id, inventory.batches, expiry)) return false;
        } else {
          const expiryStatus = productExpiryFilterStatus(product.id, inventory.batches, product.stock);
          if (expiryStatus !== expiry) return false;
        }
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
  }, [rows, inventory.batches, query, category, status, expiry, sort, kpiFocus]);

  useEffect(() => {
    setPage(1);
  }, [query, category, status, expiry, sort, pageSize, kpiFocus]);

  useEffect(() => {
    const xl = window.matchMedia("(min-width: 1280px)");
    const md = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      if (xl.matches) setLayout("table");
      else if (md.matches) setLayout("compact");
      else setLayout("cards");
    };
    apply();
    xl.addEventListener("change", apply);
    md.addEventListener("change", apply);
    return () => {
      xl.removeEventListener("change", apply);
      md.removeEventListener("change", apply);
    };
  }, []);

  const recentMovements = useMemo(() => {
    return [...inventory.movements]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 5)
      .map((item) => ({
        ...item,
        productName: inventory.products.find((product) => product.id === item.productId)?.name ?? "Unknown product",
      }));
  }, [inventory.movements, inventory.products]);

  const tableStateLabel =
    kpiFocus === "low"
      ? `Low Stock • ${visible.length} product${visible.length === 1 ? "" : "s"}`
      : kpiFocus === "out"
        ? `Out of Stock • ${visible.length} product${visible.length === 1 ? "" : "s"}`
        : kpiFocus === "soon"
          ? `Expiring Soon • ${visible.length} product${visible.length === 1 ? "" : "s"}/batches`
          : kpiFocus === "expired"
            ? `Expired • ${visible.length} product${visible.length === 1 ? "" : "s"}/batches`
            : `All Stock • ${visible.length} product${visible.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = visible.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, visible.length);

  function closeMenu() {
    setMenu(null);
  }

  function openMenu(productId: string, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const menuHeight = 148;
    const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - 8;
    setMenu((current) =>
      current?.id === productId
        ? null
        : {
            id: productId,
            top: fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6),
            right: Math.max(8, window.innerWidth - rect.right),
          },
    );
  }

  function openAdd(productId?: string) {
    setMenu(null);
    setSelectedId(productId ?? null);
    setPrefillProductId(productId ?? null);
    setDrawer("add");
  }

  function openView(productId: string) {
    const product = inventory.products.find((item) => item.id === productId);
    if (!product) return;
    setMenu(null);
    setSelectedId(product.id);
    setDrawer("view");
  }

  function openHistory(productId: string) {
    const product = inventory.products.find((item) => item.id === productId);
    if (!product) return;
    setMenu(null);
    setSelectedId(product.id);
    setDrawer("history");
  }

  function closePanel() {
    setDrawer(null);
    setSelectedId(null);
    setPrefillProductId(null);
  }

  function openAdjust(productId?: string) {
    setMenu(null);
    setSelectedId(productId ?? null);
    setPrefillProductId(productId ?? null);
    setDrawer("adjust");
  }

  function selectKpi(focus: InventoryKpiFocus) {
    setKpiFocus(focus);
    if (focus === "all" || focus === "units") {
      setStatus("all");
      setExpiry("all");
      return;
    }
    if (focus === "low") {
      setStatus("Low Stock");
      setExpiry("all");
      return;
    }
    if (focus === "out") {
      setStatus("Out of Stock");
      setExpiry("all");
      return;
    }
    setStatus("all");
    setExpiry(focus === "soon" ? "Expiring Soon" : "Expired");
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setExpiry("all");
    setKpiFocus("all");
    setSort("name");
  }

  if (workspace === "movements") {
    return (
      <FullStockMovements
        products={inventory.products}
        movements={inventory.movements}
        onBack={() => setWorkspace("inventory")}
      />
    );
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
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 hover:bg-[#102a52] sm:w-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Add Stock
          </button>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total Products"
          value={String(kpis.totalProducts)}
          hint="Full catalogue"
          icon={Package}
          tone="blue"
          active={kpiFocus === "all"}
          onClick={() => selectKpi("all")}
        />
        <KpiCard
          label="Total Stock Units"
          value={String(kpis.totalStockUnits)}
          hint="Across all products"
          icon={Warehouse}
          tone="green"
          active={kpiFocus === "units"}
          onClick={() => selectKpi("units")}
        />
        <KpiCard
          label="Low Stock"
          value={String(kpis.lowStock)}
          hint="Need attention"
          icon={AlertTriangle}
          tone="amber"
          active={kpiFocus === "low"}
          onClick={() => selectKpi("low")}
        />
        <KpiCard
          label="Out of Stock"
          value={String(kpis.outOfStock)}
          hint="Zero available"
          icon={Ban}
          tone="rose"
          active={kpiFocus === "out"}
          onClick={() => selectKpi("out")}
        />
        <KpiCard
          label="Expiring Soon"
          value={String(kpis.expiringSoonProducts)}
          hint={`Within ${EXPIRING_SOON_DAYS} days`}
          icon={Clock3}
          tone="violet"
          active={kpiFocus === "soon"}
          onClick={() => selectKpi("soon")}
        />
        <KpiCard
          label="Expired"
          value={String(kpis.expiredProducts)}
          hint="Past expiry date"
          icon={TimerReset}
          tone="pink"
          active={kpiFocus === "expired"}
          onClick={() => selectKpi("expired")}
        />
      </section>

      <section className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="relative block min-w-0 flex-1 lg:min-w-[240px]">
          <span className="sr-only">Search stock</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, SKU, barcode..."
            className={cn(filterClass, "pl-10")}
          />
        </label>
        <select
          value={category}
          onChange={(event) => {
            if (event.target.value === ADD_CATEGORY_OPTION) {
              setCategoryModalOpen(true);
              return;
            }
            if (event.target.value === MANAGE_CATEGORIES_OPTION) {
              setManageCategoriesOpen(true);
              return;
            }
            setCategory(event.target.value);
          }}
          className={cn(filterClass, "lg:w-auto lg:min-w-[11.5rem]")}
        >
          <option value="all">All Categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <CategoryDropdownActions canAdd={canAddCategory} canManage={canManageCategories} />
        </select>
        <select
          value={status}
          onChange={(event) => {
            const next = event.target.value as StockStatusFilter;
            setStatus(next);
            if (next === "Low Stock") setKpiFocus("low");
            else if (next === "Out of Stock") setKpiFocus("out");
            else if (kpiFocus === "low" || kpiFocus === "out") setKpiFocus("all");
          }}
          className={cn(filterClass, "lg:w-auto lg:min-w-[11.5rem]")}
        >
          <option value="all">All Stock Status</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
        <select
          value={expiry}
          onChange={(event) => {
            const next = event.target.value as ExpiryFilter;
            setExpiry(next);
            if (next === "Expiring Soon") setKpiFocus("soon");
            else if (next === "Expired") setKpiFocus("expired");
            else if (kpiFocus === "soon" || kpiFocus === "expired") setKpiFocus("all");
          }}
          className={cn(filterClass, "lg:w-auto lg:min-w-[11.5rem]")}
        >
          <option value="all">All Expiry Status</option>
          <option value="No Expiry">No Expiry</option>
          <option value="Normal">Normal</option>
          <option value="Expiring Soon">Expiring Soon</option>
          <option value="Expired">Expired</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as StockSort)} className={cn(filterClass, "lg:w-auto lg:min-w-[11rem]")}>
          <option value="name">Product A-Z</option>
          <option value="stock-low">Lowest Stock</option>
          <option value="stock-high">Highest Stock</option>
          <option value="expiry">Earliest Expiry</option>
        </select>
      </section>

      <section className={cn(glass, "overflow-hidden")}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-navy">{tableStateLabel}</p>
          {kpiChip ? (
            <button
              type="button"
              onClick={() => {
                setKpiFocus("all");
                setStatus("all");
                setExpiry("all");
              }}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-white/80 bg-white/80 px-2.5 text-[12px] font-medium text-navy shadow-[0_4px_12px_rgba(15,35,64,0.06)] transition duration-200 hover:bg-white"
            >
              {kpiChip}
              <X className="h-3 w-3 text-slate-400" strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <EmptyStock filtersActive={filtersActive} onClear={clearFilters} />
        ) : (
          <>
            {layout === "table" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr className="border-b border-[#d5dee8]/80">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Current Stock</th>
                    <th className="px-4 py-3 font-medium">Reorder Level</th>
                    <th className="px-4 py-3 font-medium">Stock Status</th>
                    <th className="px-4 py-3 font-medium">Expiry</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((product) => (
                    <tr key={product.id} className={tableRow}>
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
                          open={menu?.id === product.id}
                          onToggle={(button) => openMenu(product.id, button)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}

            {layout === "compact" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr className="border-b border-[#d5dee8]/80">
                    <th className="px-3.5 py-3 font-medium">Product</th>
                    <th className="px-3.5 py-3 font-medium">Stock</th>
                    <th className="px-3.5 py-3 font-medium">Status</th>
                    <th className="px-3.5 py-3 font-medium">Expiry</th>
                    <th className="px-3.5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((product) => (
                    <tr key={product.id} className={tableRow}>
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
                          open={menu?.id === product.id}
                          onToggle={(button) => openMenu(product.id, button)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}

            {layout === "cards" ? (
            <div className="space-y-2 px-3 pb-3">
              {pageRows.map((product) => (
                <article key={product.id} className="rounded-[16px] border border-white/70 bg-white/55 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <ProductName product={product} onOpen={() => openView(product.id)} />
                    <RowActions
                      product={product}
                      open={menu?.id === product.id}
                      onToggle={(button) => openMenu(product.id, button)}
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
            ) : null}

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

      <section className={cn(glass, "overflow-hidden px-4 py-3.5")}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Recent Stock Movements</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">Latest inventory activity</p>
          </div>
          <button
            type="button"
            onClick={() => setWorkspace("movements")}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-navy transition duration-200 hover:bg-white/70"
          >
            View All
            <span aria-hidden>→</span>
          </button>
        </div>
        {recentMovements.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No stock movements recorded yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-[#d5dee8]/70">
            {recentMovements.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 sm:grid-cols-[96px_minmax(0,1.2fr)_minmax(0,1fr)_64px_88px]">
                <p className="text-[12.5px] text-slate-500">{formatStockDate(item.date)}</p>
                <p className="min-w-0 truncate text-[13px] font-medium text-navy">{item.productName}</p>
                <p className="hidden min-w-0 truncate text-[12.5px] text-slate-500 sm:block">
                  {stockMovementKindLabel(item)}
                </p>
                <p className="text-right text-[13px] font-semibold text-navy">
                  {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                </p>
                <p className="hidden truncate text-right text-[12px] text-slate-400 sm:block">{item.reference}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {menu
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[79] cursor-default bg-transparent"
                aria-label="Close actions"
                onClick={closeMenu}
              />
              <div
                className="fixed z-[80] w-44 overflow-hidden rounded-[16px] border border-white/80 bg-white/90 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
                style={{ top: menu.top, right: menu.right }}
              >
                <ActionItem label="View Stock History" onSelect={() => openHistory(menu.id)} />
                {canReceive ? <ActionItem label="Adjust Stock" onSelect={() => openAdjust(menu.id)} /> : null}
                <ActionItem label="View Product" onSelect={() => openView(menu.id)} />
              </div>
            </>,
            document.body,
          )
        : null}

      {drawer === "add" ? (
        <StockDrawer kicker="Inventory" title="Add Stock" onClose={closePanel}>
          <AddStockForm
            products={inventory.products}
            batches={inventory.batches}
            prefillProductId={prefillProductId}
            onCancel={closePanel}
            onCreateProduct={(barcode) => {
              rememberNewProductBarcode(barcode);
              router.push("/supermarket/products/new");
            }}
            onSubmit={(input) => {
              inventory.receiveStock(input);
              closePanel();
            }}
          />
        </StockDrawer>
      ) : null}

      {drawer === "adjust" ? (
        <StockDrawer kicker="Inventory" title="Adjust Stock" onClose={closePanel}>
          <AdjustStockForm
            products={inventory.products}
            batches={inventory.batches}
            prefillProductId={prefillProductId}
            actorName={user?.name || "Storekeeper"}
            onCancel={closePanel}
            onSubmit={(input) => {
              const result = inventory.adjustStock(input);
              if (result.error) return result.error;
              closePanel();
              return null;
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

      <CategoryCreateModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
      />
      <CategoryManageModal
        open={manageCategoriesOpen}
        onClose={() => setManageCategoriesOpen(false)}
        onRenamed={(previousName, nextName) => {
          setCategory((current) => (current === previousName ? nextName : current));
        }}
        onDeleted={(name) => {
          setCategory((current) => (current === name ? "all" : current));
        }}
      />
    </div>
  );
}

function formatStockDate(value: string | null | undefined) {
  if (!value) return "—";
  const iso = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const MOVEMENT_PERIODS = [
  { id: "all", label: "All Dates", start: "2000-01-01", end: "9999-12-31" },
  { id: "01-16", label: "01 Sep 2026 - 16 Sep 2026", start: "2026-09-01", end: "2026-09-16" },
  { id: "01-07", label: "01 Sep 2026 - 07 Sep 2026", start: "2026-09-01", end: "2026-09-07" },
  { id: "13-16", label: "13 Sep 2026 - 16 Sep 2026", start: "2026-09-13", end: "2026-09-16" },
] as const;

function FullStockMovements({
  products,
  movements,
  onBack,
}: {
  products: SupermarketProduct[];
  movements: StockMovement[];
  onBack: () => void;
}) {
  const [periodId, setPeriodId] = useState<(typeof MOVEMENT_PERIODS)[number]["id"]>("all");
  const [productId, setProductId] = useState("all");
  const [type, setType] = useState<"all" | StockMovementFilter>("all");
  const [user, setUser] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);

  const users = useMemo(() => {
    return [...new Set(movements.map((item) => item.user || "Storekeeper"))].sort();
  }, [movements]);

  const rows = useMemo(() => {
    const period = MOVEMENT_PERIODS.find((item) => item.id === periodId) ?? MOVEMENT_PERIODS[0];
    const needle = query.trim().toLowerCase();
    return movements
      .filter((item) => {
        if (item.date < period.start || item.date > period.end) return false;
        if (productId !== "all" && item.productId !== productId) return false;
        if (type !== "all" && stockMovementKindLabel(item) !== type) return false;
        if (user !== "all" && (item.user || "Storekeeper") !== user) return false;
        if (!needle) return true;
        const productName = products.find((product) => product.id === item.productId)?.name ?? "";
        return `${productName} ${item.reference} ${stockMovementKindLabel(item)} ${item.user ?? ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [movements, products, periodId, productId, type, user, query]);

  useEffect(() => {
    setPage(1);
  }, [periodId, productId, type, user, query, pageSize]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, rows.length);

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition duration-200 hover:text-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.1} />
            Stock
          </button>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Stock Movements</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
            Complete inventory activity across purchases, sales and adjustments.
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <select
          value={periodId}
          onChange={(event) => setPeriodId(event.target.value as (typeof MOVEMENT_PERIODS)[number]["id"])}
          className={cn(filterClass, "lg:w-auto lg:min-w-[16.5rem]")}
        >
          {MOVEMENT_PERIODS.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>
        <select
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          className={cn(filterClass, "lg:w-auto lg:min-w-[12.5rem]")}
        >
          <option value="all">All Products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as "all" | StockMovementFilter)}
          className={cn(filterClass, "lg:w-auto lg:min-w-[12.5rem]")}
        >
          <option value="all">All Movement Types</option>
          {STOCK_MOVEMENT_FILTERS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={user}
          onChange={(event) => setUser(event.target.value)}
          className={cn(filterClass, "lg:w-auto lg:min-w-[9.5rem]")}
        >
          <option value="all">All Users</option>
          {users.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <label className="relative block min-w-0 flex-1 lg:min-w-[16rem]">
          <span className="sr-only">Search movements</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product, reference..."
            className={cn(filterClass, "pl-10")}
          />
        </label>
      </section>

      <section className={cn(glass, "overflow-hidden")}>
        {pageRows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[16px] font-semibold tracking-[-0.03em] text-navy">No movements found</p>
            <p className="mt-2 text-sm text-slate-500">No stock movements match the current filters.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr className="border-b border-[#d5dee8]/80">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Quantity</th>
                    <th className="px-3 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">User</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => (
                    <tr key={item.id} className={tableRow}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatStockDate(item.date)}</td>
                      <td className="px-3 py-3 font-medium text-navy">
                        {products.find((product) => product.id === item.productId)?.name ?? "Unknown product"}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{stockMovementKindLabel(item)}</td>
                      <td className="px-3 py-3 font-semibold text-navy">
                        {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{item.reference}</td>
                      <td className="px-4 py-3 text-slate-500">{item.user || "Storekeeper"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 px-3 py-3 md:hidden">
              {pageRows.map((item) => (
                <article key={item.id} className="rounded-[16px] border border-white/70 bg-white/55 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-navy">
                        {products.find((product) => product.id === item.productId)?.name ?? "Unknown product"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {formatStockDate(item.date)} · {stockMovementKindLabel(item)}
                      </p>
                    </div>
                    <p className="font-semibold text-navy">{item.quantity > 0 ? `+${item.quantity}` : item.quantity}</p>
                  </div>
                  <p className="mt-1.5 text-[12px] text-slate-400">
                    {item.reference} · {item.user || "Storekeeper"}
                  </p>
                </article>
              ))}
            </div>
            <Pagination
              from={from}
              to={to}
              total={rows.length}
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(size) => setPageSize(size)}
            />
          </>
        )}
      </section>
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
      <p className="text-[16px] font-semibold tracking-[-0.03em] text-navy">No products found</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {filtersActive
          ? "No products match the current inventory filter."
          : "Receive stock against a product from the catalogue to start inventory."}
      </p>
      {filtersActive ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[16px] bg-navy px-4 text-[14px] font-semibold text-white"
        >
          Clear Filter
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
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: KpiTone;
  active: boolean;
  onClick: () => void;
}) {
  const accent = KPI_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[24px] border px-3.5 py-3.5 text-left shadow-[0_14px_36px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-2xl transition duration-200 ease-out hover:-translate-y-px hover:shadow-[0_16px_38px_rgba(15,35,64,0.1)] sm:px-4 sm:py-4",
        accent.card,
        active && "border-navy/18 bg-white/82 shadow-[0_16px_40px_rgba(15,35,64,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-navy/8",
      )}
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition duration-200",
          accent.icon,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.85} />
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[24px] font-semibold leading-none tracking-[-0.05em] text-navy sm:text-[26px]">{value}</p>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-400">{hint}</p>
      </div>
    </button>
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
      <span className="block truncate text-[14px] font-semibold tracking-[-0.02em] text-navy">
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
        <p className="mt-0.5 text-[11.5px] text-[#b42318]/80">{formatStockDate(expired[0])}</p>
      </div>
    );
  }
  if (liveDated.length === 1) {
    const status = batchExpiryStatus(liveDated[0].expiryDate);
    return (
      <p className={cn("text-[12.5px] font-medium", status === "Expiring Soon" ? "text-violet-600" : "text-navy")}>
        {formatStockDate(next)}
      </p>
    );
  }
  if (liveDated.length) {
    return (
      <div>
        <p className="text-[12.5px] font-medium text-navy">
          {liveDated.length} batch{liveDated.length === 1 ? "" : "es"}
        </p>
        <p className="mt-0.5 text-[11.5px] text-slate-400">Next: {formatStockDate(next)}</p>
      </div>
    );
  }
  return <p className="text-[12.5px] text-slate-400">No Expiry</p>;
}

function StatusLabel({ value }: { value: string }) {
  const tone =
    value === "In Stock"
      ? "bg-emerald-50/70 text-emerald-700"
      : value === "Low Stock"
        ? "bg-amber-50/70 text-amber-700"
        : value === "Out of Stock" || value === "Expired"
          ? "bg-rose-50/70 text-rose-700"
          : value === "Expiring Soon"
            ? "bg-violet-50/70 text-violet-700"
            : "bg-slate-50/70 text-slate-600";
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
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[12px] font-medium tracking-[-0.01em]", tone)}>
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
    <div className="flex flex-col gap-2.5 border-t border-[#d5dee8]/80 bg-white/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        Showing {from} to {to} of {total} {total === 1 ? "result" : "results"}
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-slate-400 shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition hover:bg-white hover:text-navy disabled:opacity-30"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-slate-400 shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition hover:bg-white hover:text-navy disabled:opacity-30"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}
          className="h-8 rounded-full border border-white/75 bg-white/85 px-2.5 text-[12px] text-navy shadow-[0_6px_14px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-md"
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
  onToggle,
}: {
  product: SupermarketProduct;
  open: boolean;
  onToggle: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onToggle(event.currentTarget)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-slate-400 shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition duration-200 hover:bg-white hover:text-navy"
      aria-label={`Actions for ${product.name}`}
      aria-expanded={open}
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
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
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
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

const ADJUST_REASONS = ["Physical Count", "Damage", "Expired", "Lost", "Correction", "Opening Balance"] as const;
type AdjustDirection = "Increase" | "Decrease";

function mapAdjustment(direction: AdjustDirection, reason: string): {
  kind: StockAdjustmentKind;
  correctionDirection: "increase" | "decrease";
} {
  const correctionDirection = direction === "Decrease" ? "decrease" : "increase";
  if (reason === "Opening Balance") return { kind: "Opening Balance", correctionDirection };
  if (reason === "Correction") return { kind: "Correction", correctionDirection };
  if (direction === "Decrease" && reason === "Damage") return { kind: "Damage", correctionDirection };
  if (direction === "Decrease" && reason === "Expired") return { kind: "Expired", correctionDirection };
  if (direction === "Decrease" && reason === "Lost") return { kind: "Lost", correctionDirection };
  return { kind: direction, correctionDirection };
}

function AdjustStockForm({
  products,
  batches,
  prefillProductId,
  actorName,
  onCancel,
  onSubmit,
}: {
  products: SupermarketProduct[];
  batches: StockBatch[];
  prefillProductId: string | null;
  actorName: string;
  onCancel: () => void;
  onSubmit: (input: AdjustStockInput) => string | null;
}) {
  const prefilled = products.find((item) => item.id === prefillProductId) ?? null;
  const [productQuery, setProductQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(prefilled?.id ?? null);
  const [direction, setDirection] = useState<AdjustDirection>("Decrease");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]>("Physical Count");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selected = products.find((item) => item.id === selectedId) ?? null;
  const currentStock = selected ? currentStockFor(selected.id, batches) : 0;
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty > 0;
  const mapped = mapAdjustment(direction, reason);
  const delta = selected && validQty ? adjustmentDelta(mapped.kind, qty, mapped.correctionDirection) : 0;
  const nextStock = selected && validQty ? currentStock + delta : currentStock;

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

  function submit() {
    const nextErrors: Record<string, string> = {};
    if (!selected) nextErrors.product = "Select a product.";
    if (!direction) nextErrors.kind = "Select an adjustment type.";
    if (!validQty) nextErrors.quantity = "Enter a valid quantity.";
    if (!reason) nextErrors.reason = "Select a reason for this adjustment.";
    if (selected && validQty && nextStock < 0) {
      nextErrors.quantity = "Decrease cannot make stock negative.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const submitError = onSubmit({
      productId: selected!.id,
      kind: mapped.kind,
      quantity: qty,
      reason,
      note: note.trim(),
      correctionDirection: mapped.correctionDirection,
      user: actorName,
    });
    if (submitError) setErrors({ quantity: submitError });
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
        <p className="text-[12px] font-medium text-slate-500">Product</p>
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
                onClick={() => {
                  setSelectedId(item.id);
                  setProductQuery("");
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.product;
                    return next;
                  });
                }}
                className={cn(
                  "flex w-full flex-col px-3.5 py-2.5 text-left transition duration-200 hover:bg-white/80",
                  selectedId === item.id && "bg-white/90",
                )}
              >
                <span className="text-[13px] font-semibold text-navy">{item.name}</span>
                <span className="text-[12px] text-slate-500">
                  {item.sku} · {currentStockFor(item.id, batches)} units
                </span>
              </button>
            ))
          )}
        </div>
        {errors.product ? <p className="mt-1.5 text-[12px] text-slate-500">{errors.product}</p> : null}
      </section>

      {selected ? (
        <section className="rounded-[18px] border border-white/80 bg-white/55 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Stock preview</p>
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-navy">{selected.name}</h3>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
            <ReadOnlyField label="Current Stock" value={String(currentStock)} />
            <ReadOnlyField
              label="Adjustment"
              value={validQty ? (delta > 0 ? `+${delta}` : String(delta)) : "—"}
            />
            <ReadOnlyField label="New Stock" value={validQty ? String(nextStock) : "—"} />
          </dl>
        </section>
      ) : null}

      <section className="space-y-3">
        <Field label="Adjustment Type" required error={errors.kind}>
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as AdjustDirection)}
            className={inputClass}
          >
            <option value="Increase">Increase</option>
            <option value="Decrease">Decrease</option>
          </select>
        </Field>
        <Field label="Quantity" required error={errors.quantity}>
          <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Reason" required error={errors.reason}>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as (typeof ADJUST_REASONS)[number])}
            className={inputClass}
          >
            {ADJUST_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="w-full rounded-[14px] border border-white/80 bg-white/70 px-3 py-2.5 text-[13px] text-navy outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-navy/12 focus:bg-white/90"
          />
        </Field>
      </section>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-11 rounded-[16px] px-4 text-[14px] font-medium text-slate-500">
          Cancel
        </button>
        <button type="submit" className="h-11 rounded-[16px] bg-navy px-5 text-[14px] font-semibold text-white">
          Save Adjustment
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
                  <p className="text-[13px] font-medium text-navy">{movementTypeLabel(item.type, item.adjustmentKind)}</p>
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
  product: SupermarketProduct & { stock: number };
  movements: MovementRow[];
}) {
  const rows = [...movements].reverse().slice(0, 8);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[22px] font-semibold tracking-[-0.04em] text-navy">{product.name}</p>
        <p className="mt-1 text-[13px] text-slate-400">{product.sku}</p>
        <p className="mt-4 text-[12px] text-slate-400">Current Stock</p>
        <p className="text-[28px] font-semibold tracking-[-0.05em] text-navy">{product.stock}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Recent movements</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No movements recorded yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-black/[0.04]">
            {rows.map((item) => (
              <div key={item.id} className="flex items-baseline justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-slate-500">{formatStockDate(item.date)}</p>
                  <p className="mt-0.5 text-[13px] font-medium text-navy">{stockMovementKindLabel(item)}</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">{item.reference}</p>
                </div>
                <p className="shrink-0 text-[14px] font-semibold text-navy">
                  {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
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
