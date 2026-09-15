"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  ChevronDown,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  ScanLine,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isOwnerRole } from "@/lib/auth/rbac";
import { APP_TIMEZONE } from "@/lib/config/app";
import { matchPermission } from "@/lib/config/permissions";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  SUPERMARKET_PRODUCT_CATEGORIES,
  SUPERMARKET_PRODUCT_UNITS,
  NEW_PRODUCT_BARCODE_KEY,
  attachStock,
  findProductByBarcode,
  formatDisplayDate,
  movementTypeLabel,
  movementsForProduct,
  receiveStock,
  stockLabel,
  toggleProductActive,
  upsertProduct,
  useSupermarketInventory,
  type ProductStockRow,
  type SupermarketProduct,
  type SupermarketProductCategory,
  type SupermarketProductUnit,
} from "@/lib/data/supermarket-inventory";
import type { AuthUser } from "@/lib/auth/types";

type ProductStatusFilter = "all" | "active" | "inactive";
type ProductSort = "name" | "recent" | "stock-high" | "stock-low";
type ProductView = "list" | "grid";
type DrawerMode = "add" | "edit" | "view" | "history" | null;
const PAGE_SIZES = [10, 20, 50] as const;

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  buyingPrice: string;
  sellingPrice: string;
  stock: string;
  reorderLevel: string;
  trackExpiry: boolean;
  expiryDate: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductFormState = {
  name: "",
  sku: "",
  barcode: "",
  category: "",
  unit: "",
  buyingPrice: "",
  sellingPrice: "",
  stock: "0",
  reorderLevel: "0",
  trackExpiry: false,
  expiryDate: "",
  isActive: true,
};

const glass =
  "rounded-[28px] border border-white/70 bg-white/78 shadow-[0_18px_50px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-2xl";
const filterClass =
  "h-11 w-full appearance-none rounded-[18px] border border-white/80 bg-white/82 px-3.5 text-[13px] text-navy shadow-[0_8px_20px_rgba(15,35,64,0.055),inset_0_1px_0_rgba(255,255,255,0.96)] outline-none backdrop-blur-xl transition focus:border-white focus:bg-white";
const iconControl =
  "inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/80 bg-white/82 text-slate-400 shadow-[0_8px_20px_rgba(15,35,64,0.055),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-xl transition hover:bg-white hover:text-navy";
const selectClass =
  "h-11 w-full rounded-[14px] border border-white/80 bg-white/70 px-3 text-[13.5px] text-navy outline-none backdrop-blur-sm transition focus:border-navy/12 focus:bg-white/90";
const inputClass =
  "h-11 w-full rounded-[14px] border border-white/80 bg-white/70 px-3 text-[13.5px] text-navy outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-navy/12 focus:bg-white/90";
const thClass =
  "bg-[#e8eef5]/80 px-3.5 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400 first:rounded-l-[16px] last:rounded-r-[16px]";

function canManageProducts(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission(permission, matcher));
}

function formatProductsStamp(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: APP_TIMEZONE }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  }).format(date);
  return `${weekday}, ${day}  |  ${time}`;
}

function formFromProduct(product: ProductStockRow): ProductFormState {
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    unit: product.unit,
    buyingPrice: String(product.buyingPrice),
    sellingPrice: String(product.sellingPrice),
    stock: String(product.stock),
    reorderLevel: String(product.reorderLevel),
    trackExpiry: product.trackExpiry,
    expiryDate: "",
    isActive: product.isActive,
  };
}

export function ProductsManager() {
  const router = useRouter();
  const { user, isSuperAdmin } = useAuth();
  const canCreate = isSuperAdmin() || canManageProducts(user, "supermarket.products.create");
  const canEdit = isSuperAdmin() || canManageProducts(user, "supermarket.products.edit");
  const inventory = useSupermarketInventory();
  const products = useMemo(
    () => inventory.products.map((product) => attachStock(product, inventory.batches)),
    [inventory.products, inventory.batches],
  );

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<ProductStatusFilter>("all");
  const [sort, setSort] = useState<ProductSort>("name");
  const [view, setView] = useState<ProductView>("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [toolbarMore, setToolbarMore] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [barcodeNotice, setBarcodeNotice] = useState<string | null>(null);

  const selected = products.find((item) => item.id === selectedId) ?? null;
  const filtersActive = Boolean(query.trim()) || category !== "all" || status !== "all";

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (category !== "all" && product.category !== category) return false;
      if (status === "active" && !product.isActive) return false;
      if (status === "inactive" && product.isActive) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle) ||
        product.barcode.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "stock-high") return b.stock - a.stock;
      if (sort === "stock-low") return a.stock - b.stock;
      return a.name.localeCompare(b.name);
    });
  }, [products, query, category, status, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, category, status, sort, pageSize]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, rows.length);

  function openAdd(prefill?: Partial<ProductFormState>) {
    if (prefill?.barcode) {
      try {
        sessionStorage.setItem(NEW_PRODUCT_BARCODE_KEY, prefill.barcode);
      } catch {
        // Ignore storage errors in private browsing.
      }
    }
    router.push("/supermarket/products/new");
  }

  useEffect(() => {
    try {
      if (sessionStorage.getItem(NEW_PRODUCT_BARCODE_KEY)) {
        router.replace("/supermarket/products/new");
      }
    } catch {
      // Ignore storage errors in private browsing.
    }
  }, [router]);

  function openView(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setMenuId(null);
    setSelectedId(product.id);
    setDrawer("view");
  }

  function openEdit(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setMenuId(null);
    setSelectedId(product.id);
    setForm(formFromProduct(product));
    setErrors({});
    setBarcodeNotice(null);
    setDrawer("edit");
  }

  function openHistory(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setMenuId(null);
    setSelectedId(product.id);
    setDrawer("history");
  }

  function closePanel() {
    setDrawer(null);
    setSelectedId(null);
    setErrors({});
    setBarcodeNotice(null);
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setSort("name");
  }

  function toggleActive(productId: string) {
    setMenuId(null);
    toggleProductActive(productId);
  }

  function lookupBarcode(code: string) {
    const match = findProductByBarcode(inventory.products, code, selectedId);
    if (match) {
      setBarcodeNotice(null);
      openView(match.id);
      return;
    }
    if (code.trim()) {
      setBarcodeNotice("No matching product. You can create a new product with this barcode.");
      if (drawer !== "add" && drawer !== "edit") {
        openAdd({ barcode: code.trim() });
        return;
      }
    }
    setForm((current) => ({ ...current, barcode: code.trim() }));
  }

  function saveProduct() {
    const nextErrors: Record<string, string> = {};
    const name = form.name.trim();
    const sku = form.sku.trim().toUpperCase();
    const barcode = form.barcode.trim();
    const buyingPrice = Number(form.buyingPrice);
    const sellingPrice = Number(form.sellingPrice);
    const stock = form.stock.trim() === "" ? 0 : Number(form.stock);
    const reorderLevel = form.reorderLevel.trim() === "" ? 0 : Number(form.reorderLevel);
    const expiryDate = form.trackExpiry ? form.expiryDate.trim() : "";

    if (!name) nextErrors.name = "Enter a product name.";
    if (!sku) nextErrors.sku = "Enter a SKU.";
    if (!form.category) nextErrors.category = "Select a category.";
    if (!form.unit) nextErrors.unit = "Select a unit.";
    if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
      nextErrors.buyingPrice = "Enter a valid buying price.";
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      nextErrors.sellingPrice = "Enter a valid selling price.";
    }
    if (!Number.isFinite(stock) || stock < 0) nextErrors.stock = "Enter a valid opening stock.";
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      nextErrors.reorderLevel = "Enter a valid reorder level.";
    }
    if (drawer === "add" && form.trackExpiry && stock > 0 && !expiryDate) {
      nextErrors.expiryDate = "Enter an expiry date for the opening batch.";
    }

    const skuTaken = products.some(
      (item) => item.sku.toLowerCase() === sku.toLowerCase() && item.id !== selectedId,
    );
    if (sku && skuTaken) nextErrors.sku = "This SKU is already in use.";

    const barcodeTaken = findProductByBarcode(inventory.products, barcode, selectedId);
    if (barcode && barcodeTaken) {
      nextErrors.barcode = `This barcode already belongs to ${barcodeTaken.name}.`;
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const payload: SupermarketProduct = {
      id: selected?.id ?? `prd-${Date.now()}`,
      name,
      sku,
      barcode,
      category: form.category as SupermarketProductCategory,
      unit: form.unit as SupermarketProductUnit,
      buyingPrice,
      sellingPrice,
      reorderLevel,
      trackExpiry: form.trackExpiry,
      isActive: form.isActive,
      createdAt: selected?.createdAt ?? new Date().toISOString(),
    };

    upsertProduct(payload);
    if (!selected && stock > 0) {
      receiveStock({
        productId: payload.id,
        quantity: stock,
        batchNumber: "OPENING",
        expiryDate: form.trackExpiry ? expiryDate : null,
        buyingPrice,
        type: "Opening Stock",
        reference: "OPENING",
        note: "Opening stock",
      });
    }
    closePanel();
  }

  function rowActions(product: ProductStockRow) {
    return (
      <RowActions
        product={product}
        open={menuId === product.id}
        canEdit={canEdit}
        onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
        onClose={() => setMenuId(null)}
        onView={() => openView(product.id)}
        onEdit={() => openEdit(product.id)}
        onHistory={() => openHistory(product.id)}
        onToggleActive={() => toggleActive(product.id)}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-[-0.05em] text-navy sm:text-[32px]">Products</h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-5 text-slate-500">
            Manage supermarket products, pricing, stock settings and product information.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
          <p className="hidden whitespace-nowrap text-[12.5px] tabular-nums text-slate-400 lg:block">
            {now ? formatProductsStamp(now) : "\u00a0"}
          </p>
          {canCreate ? (
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#102a52] sm:w-auto"
            >
              <Plus className="h-4 w-4 text-white" strokeWidth={2.25} />
              Add Product
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="relative block min-w-0 flex-1 lg:min-w-[240px] lg:max-w-[340px]">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, SKU, barcode..."
            className={cn(filterClass, "pl-10")}
          />
        </label>
        <FilterSelect
          value={category}
          onChange={setCategory}
          icon={<LayoutGrid className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />}
          className="lg:w-[168px]"
        >
          <option value="all">All Categories</option>
          {SUPERMARKET_PRODUCT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={status}
          onChange={(value) => setStatus(value as ProductStatusFilter)}
          icon={<span className="h-2 w-2 rounded-full bg-emerald-400" />}
          className="lg:w-[148px]"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </FilterSelect>
        <FilterSelect
          value={sort}
          onChange={(value) => setSort(value as ProductSort)}
          icon={<ArrowUpDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />}
          className="lg:w-[188px]"
        >
          <option value="name">Product Name (A - Z)</option>
          <option value="recent">Recently Added</option>
          <option value="stock-high">Highest Stock</option>
          <option value="stock-low">Lowest Stock</option>
        </FilterSelect>
        <div className="flex items-center gap-2 lg:ml-auto">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(iconControl, view === "list" && "bg-white text-navy")}
            aria-label="List view"
            aria-pressed={view === "list"}
          >
            <List className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn(iconControl, view === "grid" && "bg-white text-navy")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setToolbarMore((current) => !current)}
              className={iconControl}
              aria-label="More actions"
              aria-expanded={toolbarMore}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
            </button>
            {toolbarMore ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-20 cursor-default"
                  aria-label="Close more actions"
                  onClick={() => setToolbarMore(false)}
                />
                <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-[16px] border border-white/80 bg-white/92 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters();
                      setToolbarMore(false);
                    }}
                    className="flex w-full px-3 py-2 text-left text-[13px] text-navy hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <section className={cn(glass, "overflow-hidden")}>
        {rows.length === 0 ? (
          <EmptyProducts filtersActive={filtersActive} onClear={clearFilters} />
        ) : (
          <>
            {view === "grid" ? (
              <div className="grid gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((product) => (
                  <ProductCard key={product.id} product={product} actions={rowActions(product)} />
                ))}
              </div>
            ) : (
              <>
                <div className="hidden px-3 pt-3 xl:block">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
                    <thead>
                      <tr>
                        <th className={thClass}>Product</th>
                        <th className={thClass}>SKU</th>
                        <th className={thClass}>Barcode</th>
                        <th className={thClass}>Category</th>
                        <th className={thClass}>Unit</th>
                        <th className={thClass}>Buying Price</th>
                        <th className={thClass}>Selling Price</th>
                        <th className={thClass}>Stock</th>
                        <th className={thClass}>Reorder Level</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="[&_td]:border-t [&_td]:border-[#dce5ee]/85">
                      {pageRows.map((product) => (
                        <tr key={product.id}>
                          <td className="px-3.5 py-3.5">
                            <p className="font-semibold tracking-[-0.02em] text-navy">{product.name}</p>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-slate-400">{product.sku}</td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-slate-400">{product.barcode || "—"}</td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-slate-500">{product.category}</td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-slate-500">{product.unit}</td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-slate-500">{formatTzs(product.buyingPrice)}</td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-slate-500">{formatTzs(product.sellingPrice)}</td>
                          <td className="px-3.5 py-3.5">
                            <StockCell product={product} />
                          </td>
                          <td className="px-3.5 py-3.5 text-slate-500">{product.reorderLevel}</td>
                          <td className="px-3.5 py-3.5">
                            <StatusPill product={product} />
                          </td>
                          <td className="px-3.5 py-3.5">{rowActions(product)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="hidden px-3 pt-3 md:block xl:hidden">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
                    <thead>
                      <tr>
                        <th className={thClass}>Product</th>
                        <th className={thClass}>SKU</th>
                        <th className={thClass}>Category</th>
                        <th className={thClass}>Selling Price</th>
                        <th className={thClass}>Stock</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="[&_td]:border-t [&_td]:border-[#dce5ee]/85">
                      {pageRows.map((product) => (
                        <tr key={product.id}>
                          <td className="px-3.5 py-3.5">
                            <p className="font-semibold tracking-[-0.02em] text-navy">{product.name}</p>
                          </td>
                          <td className="px-3.5 py-3.5 text-slate-400">{product.sku}</td>
                          <td className="px-3.5 py-3.5 text-slate-500">{product.category}</td>
                          <td className="px-3.5 py-3.5 text-slate-500">{formatTzs(product.sellingPrice)}</td>
                          <td className="px-3.5 py-3.5">
                            <StockCell product={product} />
                          </td>
                          <td className="px-3.5 py-3.5">
                            <StatusPill product={product} />
                          </td>
                          <td className="px-3.5 py-3.5">{rowActions(product)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 px-3 py-3 md:hidden">
                  {pageRows.map((product) => (
                    <ProductCard key={product.id} product={product} actions={rowActions(product)} />
                  ))}
                </div>
              </>
            )}

            <Pagination
              from={from}
              to={to}
              total={rows.length}
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </>
        )}
      </section>

      {drawer === "edit" ? (
        <ProductDrawer
          title="Edit Product"
          onClose={closePanel}
        >
          <ProductForm
            form={form}
            errors={errors}
            barcodeNotice={barcodeNotice}
            submitLabel="Save Changes"
            stockLabel="Current Stock"
            stockReadOnly
            showExpiryDate={false}
            onChange={(next) => {
              setForm(next);
              setBarcodeNotice(null);
            }}
            onLookupBarcode={lookupBarcode}
            onCancel={closePanel}
            onSubmit={saveProduct}
          />
        </ProductDrawer>
      ) : null}

      {drawer === "view" && selected ? (
        <ProductDrawer title="Product details" onClose={closePanel}>
          <ProductDetails
            product={selected}
            canEdit={canEdit}
            onEdit={() => openEdit(selected.id)}
          />
        </ProductDrawer>
      ) : null}

      {drawer === "history" && selected ? (
        <ProductDrawer title="Stock History" onClose={closePanel}>
          <StockHistoryPanel
            product={selected}
            movements={movementsForProduct(selected.id, inventory.movements)}
          />
        </ProductDrawer>
      ) : null}
    </div>
  );
}

function EmptyProducts({
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
          ? "Nothing matches the current search or filters."
          : "Add a supermarket product to start building the catalogue."}
      </p>
      {filtersActive ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-[#0b2244] px-4 text-[14px] font-semibold text-white"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  icon,
  className,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("relative block min-w-0", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(filterClass, "cursor-pointer pl-9 pr-9")}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
    </label>
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
    <div className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        Showing {from} to {to} of {total} products
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

function ProductCard({
  product,
  actions,
}: {
  product: ProductStockRow;
  actions: ReactNode;
}) {
  return (
    <article className="rounded-[16px] border border-white/70 bg-white/55 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tracking-[-0.02em] text-navy">{product.name}</p>
          <p className="mt-0.5 text-[12px] text-slate-400">
            {product.sku} · {product.category}
          </p>
        </div>
        {actions}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StockCell product={product} />
        <StatusPill product={product} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[12.5px]">
        <span className="text-slate-500">{product.unit}</span>
        <span className="font-semibold text-navy">{formatTzs(product.sellingPrice)}</span>
      </div>
    </article>
  );
}

function StockCell({ product }: { product: ProductStockRow }) {
  return <p className="text-[14px] font-semibold tracking-[-0.03em] text-navy">{product.stock}</p>;
}

function StatusPill({ product }: { product: ProductStockRow }) {
  if (!product.isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-2 py-[3px] text-[12px] font-medium text-slate-600">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Inactive
      </span>
    );
  }
  const label = stockLabel(product);
  const tone =
    label === "In Stock"
      ? "bg-emerald-50/70 text-emerald-700"
      : label === "Low Stock"
        ? "bg-amber-50/70 text-amber-700"
        : "bg-rose-50/70 text-rose-700";
  const dot =
    label === "In Stock" ? "bg-emerald-500" : label === "Low Stock" ? "bg-amber-400" : "bg-rose-500";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[12px] font-medium", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
        active ? "bg-[#e7f4ea] text-[#3f8a5a]" : "bg-[#eef0f3] text-slate-500",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RowActions({
  product,
  open,
  canEdit,
  onToggle,
  onClose,
  onView,
  onEdit,
  onHistory,
  onToggleActive,
}: {
  product: SupermarketProduct;
  open: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onClose: () => void;
  onView: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onToggleActive: () => void;
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
            <ActionItem label="View" onSelect={onView} />
            {canEdit ? <ActionItem label="Edit" onSelect={onEdit} /> : null}
            <ActionItem label="Stock History" onSelect={onHistory} />
            {canEdit ? (
              <ActionItem
                label={product.isActive ? "Deactivate" : "Activate"}
                onSelect={onToggleActive}
                tone={product.isActive ? "danger" : "default"}
              />
            ) : null}
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-navy/70 shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition hover:bg-white hover:text-navy"
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
  tone = "default",
}: {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
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
      className={cn(
        "flex w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50",
        tone === "danger" ? "text-[#b42318]" : "text-navy",
      )}
    >
      {label}
    </button>
  );
}

function ProductDrawer({
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
      <button type="button" className="absolute inset-0 bg-navy/20 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[520px] flex-col border-l border-white/70 bg-white/82 shadow-[-24px_0_60px_rgba(15,35,64,0.12)] backdrop-blur-[28px]">
        <div className="flex items-center justify-between px-5 py-5">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-navy/[0.04] text-slate-500 hover:text-navy"
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

function ProductForm({
  form,
  errors,
  barcodeNotice,
  submitLabel,
  stockLabel: stockFieldLabel,
  stockReadOnly = false,
  showExpiryDate = true,
  onChange,
  onLookupBarcode,
  onCancel,
  onSubmit,
}: {
  form: ProductFormState;
  errors: Record<string, string>;
  barcodeNotice: string | null;
  submitLabel: string;
  stockLabel: string;
  stockReadOnly?: boolean;
  showExpiryDate?: boolean;
  onChange: (form: ProductFormState) => void;
  onLookupBarcode: (code: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const barcodeRef = useRef<HTMLInputElement>(null);

  function patch<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Product Information
        </h3>
        <div className="mt-3 space-y-3">
          <Field label="Product Name" required error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => patch("name", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="SKU"
            required
            hint="Internal unique product identifier. This is not the barcode."
            error={errors.sku}
          >
            <input
              value={form.sku}
              onChange={(event) => patch("sku", event.target.value)}
              className={inputClass}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Barcode</span>
            <div className="flex gap-2">
              <input
                ref={barcodeRef}
                value={form.barcode}
                onChange={(event) => patch("barcode", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onLookupBarcode(form.barcode);
                  }
                }}
                placeholder="Optional"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  barcodeRef.current?.focus();
                  if (form.barcode.trim()) onLookupBarcode(form.barcode);
                }}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13px] font-semibold text-navy transition hover:bg-[#f8fafc]"
              >
                <ScanLine className="h-4 w-4" strokeWidth={1.8} />
                Scan
              </button>
            </div>
            <p className="mt-1.5 text-[12px] text-slate-400">
              Optional scanner field. Scanning focuses this input and looks up an existing product.
            </p>
            {errors.barcode ? (
              <p className="mt-1.5 text-[12px] text-[#8a5a5a]">{errors.barcode}</p>
            ) : null}
            {barcodeNotice ? (
              <p className="mt-1.5 text-[12px] text-slate-500">{barcodeNotice}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category" required error={errors.category}>
              <select
                value={form.category}
                onChange={(event) => patch("category", event.target.value)}
                className={selectClass}
              >
                <option value="">Select category</option>
                {SUPERMARKET_PRODUCT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit" required error={errors.unit}>
              <select
                value={form.unit}
                onChange={(event) => patch("unit", event.target.value)}
                className={selectClass}
              >
                <option value="">Select unit</option>
                {SUPERMARKET_PRODUCT_UNITS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Pricing</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Buying Price" required error={errors.buyingPrice}>
            <input
              inputMode="numeric"
              value={form.buyingPrice}
              onChange={(event) => patch("buyingPrice", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Selling Price" required error={errors.sellingPrice}>
            <input
              inputMode="numeric"
              value={form.sellingPrice}
              onChange={(event) => patch("sellingPrice", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Inventory Settings
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={stockFieldLabel}
            error={errors.stock}
            hint={stockReadOnly ? "Current stock is calculated from inventory batches on Stock." : undefined}
          >
            <input
              inputMode="numeric"
              value={form.stock}
              readOnly={stockReadOnly}
              onChange={(event) => {
                if (stockReadOnly) return;
                patch("stock", event.target.value);
              }}
              className={cn(inputClass, stockReadOnly && "bg-[#f8fafc] text-slate-500")}
            />
          </Field>
          <Field label="Reorder Level" error={errors.reorderLevel}>
            <input
              inputMode="numeric"
              value={form.reorderLevel}
              onChange={(event) => patch("reorderLevel", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4 space-y-3">
          <Toggle
            label="Expiry Tracking"
            checked={form.trackExpiry}
            onChange={(value) => patch("trackExpiry", value)}
          />
          {form.trackExpiry && showExpiryDate ? (
            <Field label="Expiry Date" required error={errors.expiryDate} hint="Applies to the opening stock batch.">
              <input
                type="date"
                value={form.expiryDate}
                onChange={(event) => patch("expiryDate", event.target.value)}
                className={inputClass}
              />
            </Field>
          ) : null}
          <Toggle
            label="Active"
            checked={form.isActive}
            onChange={(value) => patch("isActive", value)}
          />
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function ProductDetails({
  product,
  canEdit,
  onEdit,
}: {
  product: ProductStockRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const margin = product.sellingPrice - product.buyingPrice;
  const stockValue = product.stock * product.buyingPrice;

  return (
    <div className="space-y-6">
      <section className="rounded-[16px] bg-[#f8fafc] px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Product Summary
        </p>
        <h3 className="mt-2 text-[20px] font-bold tracking-[-0.03em] text-navy">{product.name}</h3>
        <p className="mt-1 text-[13px] text-slate-500">
          {product.sku} · {product.category}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <SummaryStat label="Stock value" value={formatTzs(stockValue)} />
          <SummaryStat label="Unit margin" value={formatTzs(margin)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StockCell product={product} />
          <ActiveBadge active={product.isActive} />
        </div>
      </section>

      <dl className="space-y-3 text-[13.5px]">
        <DetailRow label="Product name" value={product.name} />
        <DetailRow label="SKU" value={product.sku} />
        <DetailRow label="Barcode" value={product.barcode || "—"} />
        <DetailRow label="Category" value={product.category} />
        <DetailRow label="Unit" value={product.unit} />
        <DetailRow label="Buying price" value={formatTzs(product.buyingPrice)} />
        <DetailRow label="Selling price" value={formatTzs(product.sellingPrice)} />
        <DetailRow label="Opening / current stock" value={String(product.stock)} />
        <DetailRow label="Reorder level" value={String(product.reorderLevel)} />
        <DetailRow label="Expiry tracking" value={product.trackExpiry ? "On" : "Off"} />
        <DetailRow label="Status" value={product.isActive ? "Active" : "Inactive"} />
      </dl>

      {canEdit ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onEdit}
            className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white"
          >
            Edit Product
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
  movements: ReturnType<typeof movementsForProduct>;
}) {
  const rows = [...movements].reverse();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-semibold text-navy">{product.name}</p>
        <p className="mt-1 text-[13px] text-slate-500">
          Shared inventory movements for this product. The Stock page uses the same records.
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
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-t border-black/4">
                  <td className="px-4 py-3 text-slate-500">
                    <p>{formatDisplayDate(item.date)}</p>
                    <p className="mt-0.5 text-[11px]">{item.reference}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-navy">{movementTypeLabel(item.type)}</td>
                  <td className={cn("px-4 py-3 font-semibold", item.quantity < 0 ? "text-[#8a5a5a]" : "text-[#5a7a64]")}>
                    {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                  </td>
                  <td className="px-4 py-3 font-semibold text-navy">{item.balance}</td>
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
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
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
      {hint ? <span className="mt-1.5 block text-[12px] text-slate-400">{hint}</span> : null}
      {error ? <span className="mt-1.5 block text-[12px] text-[#8a5a5a]">{error}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-[14px] bg-[#f8fafc] px-3 py-3 text-left"
    >
      <span className="text-[13.5px] font-medium text-navy">{label}</span>
      <span
        className={cn(
          "relative h-6 w-10 rounded-full transition",
          checked ? "bg-navy" : "bg-[#d9dee6]",
        )}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition"
          style={{ left: checked ? 18 : 2 }}
        />
      </span>
    </button>
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-white px-3 py-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-[14px] font-semibold tracking-[-0.02em] text-navy">{value}</p>
    </div>
  );
}
