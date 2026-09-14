"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Plus, ScanLine, Search, X } from "lucide-react";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  SUPERMARKET_PRODUCT_CATEGORIES,
  SUPERMARKET_PRODUCT_UNITS,
  SUPERMARKET_SAMPLE_PRODUCTS,
  mockStockHistory,
  stockLabel,
  type SupermarketProduct,
  type SupermarketProductCategory,
  type SupermarketProductUnit,
} from "@/lib/data/sample-supermarket-products";
import type { AuthUser } from "@/lib/auth/types";

type ProductStatusFilter = "all" | "active" | "inactive";
type ProductSort = "name" | "recent" | "stock-high" | "stock-low";
type DrawerMode = "add" | "edit" | "view" | "history" | null;

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

const selectClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";
const inputClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

function canManageProducts(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission(permission, matcher));
}

function formFromProduct(product: SupermarketProduct): ProductFormState {
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
    expiryDate: product.expiryDate ?? "",
    isActive: product.isActive,
  };
}

function formatExpiry(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function findByBarcode(products: SupermarketProduct[], barcode: string, excludeId?: string | null) {
  const code = barcode.trim();
  if (!code) return null;
  return (
    products.find(
      (item) => item.barcode && item.barcode === code && item.id !== excludeId,
    ) ?? null
  );
}

export function ProductsManager() {
  const { user, isSuperAdmin } = useAuth();
  const canCreate = isSuperAdmin() || canManageProducts(user, "supermarket.products.create");
  const canEdit = isSuperAdmin() || canManageProducts(user, "supermarket.products.edit");

  const [products, setProducts] = useState(SUPERMARKET_SAMPLE_PRODUCTS);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<ProductStatusFilter>("all");
  const [sort, setSort] = useState<ProductSort>("name");
  const [menuId, setMenuId] = useState<string | null>(null);
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

  function openAdd(prefill?: Partial<ProductFormState>) {
    setSelectedId(null);
    setForm({ ...EMPTY_FORM, ...prefill });
    setErrors({});
    setBarcodeNotice(null);
    setMenuId(null);
    setDrawer("add");
  }

  function openView(product: SupermarketProduct) {
    setSelectedId(product.id);
    setMenuId(null);
    setDrawer("view");
  }

  function openEdit(product: SupermarketProduct) {
    setSelectedId(product.id);
    setForm(formFromProduct(product));
    setErrors({});
    setBarcodeNotice(null);
    setMenuId(null);
    setDrawer("edit");
  }

  function openHistory(product: SupermarketProduct) {
    setSelectedId(product.id);
    setMenuId(null);
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

  function toggleActive(product: SupermarketProduct) {
    setProducts((current) =>
      current.map((item) =>
        item.id === product.id ? { ...item, isActive: !item.isActive } : item,
      ),
    );
    setMenuId(null);
    if (selectedId === product.id && drawer === "view") {
      setSelectedId(product.id);
    }
  }

  function lookupBarcode(code: string) {
    const match = findByBarcode(products, code, selectedId);
    if (match) {
      setBarcodeNotice(null);
      openView(match);
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
    if (form.trackExpiry && !expiryDate) {
      nextErrors.expiryDate = "Enter an expiry date.";
    }

    const skuTaken = products.some(
      (item) => item.sku.toLowerCase() === sku.toLowerCase() && item.id !== selectedId,
    );
    if (sku && skuTaken) nextErrors.sku = "This SKU is already in use.";

    const barcodeTaken = findByBarcode(products, barcode, selectedId);
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
      stock,
      reorderLevel,
      trackExpiry: form.trackExpiry,
      expiryDate: form.trackExpiry ? expiryDate : null,
      isActive: form.isActive,
      createdAt: selected?.createdAt ?? new Date().toISOString(),
    };

    setProducts((current) => {
      if (selected) {
        return current.map((item) => (item.id === selected.id ? payload : item));
      }
      return [payload, ...current];
    });
    closePanel();
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        title="Products"
        description="Manage supermarket products, pricing, stock settings and product information."
        action={
          canCreate ? (
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white transition hover:bg-[#132844] sm:w-auto"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              Add Product
            </button>
          ) : null
        }
      />

      <Surface className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search products</span>
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
            onChange={(event) => setStatus(event.target.value as ProductStatusFilter)}
            className={selectClass}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ProductSort)}
            className={selectClass}
          >
            <option value="name">Product Name</option>
            <option value="recent">Recently Added</option>
            <option value="stock-high">Highest Stock</option>
            <option value="stock-low">Lowest Stock</option>
          </select>
        </div>
      </Surface>

      {rows.length === 0 ? (
        <EmptyProducts filtersActive={filtersActive} onClear={clearFilters} />
      ) : (
        <>
          <Surface className="hidden xl:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">SKU</th>
                    <th className="px-5 py-3 font-medium">Barcode</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Unit</th>
                    <th className="px-5 py-3 font-medium">Buying Price</th>
                    <th className="px-5 py-3 font-medium">Selling Price</th>
                    <th className="px-5 py-3 font-medium">Stock</th>
                    <th className="px-5 py-3 font-medium">Reorder Level</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id} className="border-t border-black/4 hover:bg-[#fbfcfe]">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-navy">{product.name}</p>
                        <p className="mt-0.5 text-[12px] text-slate-500">{product.category}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{product.sku}</td>
                      <td className="px-5 py-3.5 text-slate-600">{product.barcode || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-600">{product.category}</td>
                      <td className="px-5 py-3.5 text-slate-600">{product.unit}</td>
                      <td className="px-5 py-3.5 text-slate-600">{formatTzs(product.buyingPrice)}</td>
                      <td className="px-5 py-3.5 font-medium text-navy">{formatTzs(product.sellingPrice)}</td>
                      <td className="px-5 py-3.5">
                        <StockCell product={product} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{product.reorderLevel}</td>
                      <td className="px-5 py-3.5">
                        <ActiveBadge active={product.isActive} />
                      </td>
                      <td className="px-5 py-3.5">
                        <RowActions
                          product={product}
                          open={menuId === product.id}
                          canEdit={canEdit}
                          onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
                          onClose={() => setMenuId(null)}
                          onView={() => openView(product)}
                          onEdit={() => openEdit(product)}
                          onHistory={() => openHistory(product)}
                          onToggleActive={() => toggleActive(product)}
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
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Selling Price</th>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id} className="border-t border-black/4 hover:bg-[#fbfcfe]">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-navy">{product.name}</p>
                        <p className="mt-0.5 text-[12px] text-slate-500">{product.sku}</p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{product.sku}</td>
                      <td className="px-4 py-3.5 text-slate-600">{product.category}</td>
                      <td className="px-4 py-3.5 font-medium text-navy">{formatTzs(product.sellingPrice)}</td>
                      <td className="px-4 py-3.5">
                        <StockCell product={product} />
                      </td>
                      <td className="px-4 py-3.5">
                        <ActiveBadge active={product.isActive} />
                      </td>
                      <td className="px-4 py-3.5">
                        <RowActions
                          product={product}
                          open={menuId === product.id}
                          canEdit={canEdit}
                          onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
                          onClose={() => setMenuId(null)}
                          onView={() => openView(product)}
                          onEdit={() => openEdit(product)}
                          onHistory={() => openHistory(product)}
                          onToggleActive={() => toggleActive(product)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          <div className="space-y-2.5 md:hidden">
            {rows.map((product) => (
              <article
                key={product.id}
                className="rounded-[16px] border border-white/90 bg-white px-3.5 py-3.5 shadow-[0_6px_20px_rgba(20,40,70,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{product.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {product.sku} · {product.category}
                    </p>
                  </div>
                  <RowActions
                    product={product}
                    open={menuId === product.id}
                    canEdit={canEdit}
                    onToggle={() => setMenuId((current) => (current === product.id ? null : product.id))}
                    onClose={() => setMenuId(null)}
                    onView={() => openView(product)}
                    onEdit={() => openEdit(product)}
                    onHistory={() => openHistory(product)}
                    onToggleActive={() => toggleActive(product)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StockCell product={product} />
                  <ActiveBadge active={product.isActive} />
                </div>
                <div className="mt-3 flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-500">{product.unit}</span>
                  <span className="font-semibold text-navy">{formatTzs(product.sellingPrice)}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {drawer === "add" || drawer === "edit" ? (
        <ProductDrawer
          title={drawer === "add" ? "Add Product" : "Edit Product"}
          onClose={closePanel}
        >
          <ProductForm
            form={form}
            errors={errors}
            barcodeNotice={barcodeNotice}
            submitLabel={drawer === "add" ? "Add Product" : "Save Changes"}
            stockLabel={drawer === "add" ? "Opening Stock" : "Current Stock"}
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
            onEdit={() => openEdit(selected)}
          />
        </ProductDrawer>
      ) : null}

      {drawer === "history" && selected ? (
        <ProductDrawer title="Stock History" onClose={closePanel}>
          <StockHistoryPanel product={selected} />
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
    <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-6 py-14 text-center shadow-card">
      <p className="text-[15px] font-semibold text-navy">No products found</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {filtersActive
          ? "Nothing matches the current search or filters."
          : "Add a supermarket product to start building the catalogue."}
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

function StockCell({ product }: { product: SupermarketProduct }) {
  const label = stockLabel(product);
  return (
    <div>
      <p className="font-medium text-navy">{product.stock}</p>
      <p
        className={cn(
          "mt-0.5 text-[11px] font-medium",
          label === "Out of Stock" && "text-[#8a5a5a]",
          label === "Low Stock" && "text-[#8a7340]",
          label === "In Stock" && "text-[#5a7a64]",
        )}
      >
        {label}
      </p>
    </div>
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
  const menuRef = useRef<HTMLDivElement>(null);
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
    function handle(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handle);
    window.addEventListener("resize", placeMenu);
    return () => {
      document.removeEventListener("mousedown", handle);
      window.removeEventListener("resize", placeMenu);
    };
  }, [open, onClose]);

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[80] w-44 overflow-hidden rounded-[14px] border border-black/6 bg-white py-1 shadow-[0_16px_40px_rgba(16,24,40,0.12)]"
          style={{ top: coords.top, right: coords.right }}
        >
          <ActionItem label="View" onClick={onView} />
          {canEdit ? <ActionItem label="Edit" onClick={onEdit} /> : null}
          <ActionItem label="Stock History" onClick={onHistory} />
          {canEdit ? (
            <ActionItem
              label={product.isActive ? "Deactivate" : "Activate"}
              onClick={onToggleActive}
              tone={product.isActive ? "danger" : "default"}
            />
          ) : null}
        </div>,
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
  onClick,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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

function ProductForm({
  form,
  errors,
  barcodeNotice,
  submitLabel,
  stockLabel: stockFieldLabel,
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
          <Field label={stockFieldLabel} error={errors.stock}>
            <input
              inputMode="numeric"
              value={form.stock}
              onChange={(event) => patch("stock", event.target.value)}
              className={inputClass}
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
          {form.trackExpiry ? (
            <Field label="Expiry Date" required error={errors.expiryDate}>
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
  product: SupermarketProduct;
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
        <DetailRow label="Expiry date" value={product.trackExpiry ? formatExpiry(product.expiryDate) : "—"} />
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

function StockHistoryPanel({ product }: { product: SupermarketProduct }) {
  const movements = mockStockHistory(product);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-semibold text-navy">{product.name}</p>
        <p className="mt-1 text-[13px] text-slate-500">
          Mock stock movements for this product. Live history will connect later in Stock.
        </p>
      </div>
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
            {movements.map((item) => (
              <tr key={item.id} className="border-t border-black/4">
                <td className="px-4 py-3 text-slate-500">
                  <p>{item.date}</p>
                  <p className="mt-0.5 text-[11px]">{item.note}</p>
                </td>
                <td className="px-4 py-3 font-medium text-navy">{item.type}</td>
                <td className={cn("px-4 py-3 font-semibold", item.quantity < 0 ? "text-[#8a5a5a]" : "text-[#5a7a64]")}>
                  {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                </td>
                <td className="px-4 py-3 font-semibold text-navy">{item.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
