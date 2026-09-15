"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  categoryProductCount,
  deleteProductCategory,
  setProductCategoryActive,
  useSupermarketInventory,
  type SupermarketCategory,
} from "@/lib/data/supermarket-inventory";
import { CategoryCreateModal } from "@/components/supermarket/CategoryCreateModal";

export function CategoryManageModal({
  open,
  onClose,
  onRenamed,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onRenamed?: (previousName: string, nextName: string) => void;
  onDeleted?: (name: string) => void;
}) {
  const titleId = useId();
  const inventory = useSupermarketInventory();
  const [editing, setEditing] = useState<SupermarketCategory | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { type: "delete"; category: SupermarketCategory }
    | { type: "deactivate"; category: SupermarketCategory }
    | null
  >(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setMenuId(null);
      setConfirm(null);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirm) {
        setConfirm(null);
        return;
      }
      if (editing) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, editing, confirm]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="modal-overlay-enter absolute inset-0 bg-navy/25 backdrop-blur-[3px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel-enter relative flex max-h-[min(72vh,560px)] w-full max-w-[480px] flex-col rounded-[24px] border border-white/80 bg-white/86 shadow-[0_24px_60px_rgba(15,35,64,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
              Manage Categories
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">Create, edit or manage your product categories.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-500 shadow-[0_4px_10px_rgba(15,35,64,0.06)] transition hover:text-navy"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
          {inventory.categories.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-slate-400">No categories yet.</p>
          ) : (
            <ul className="divide-y divide-[#dbe4ef]/70 overflow-hidden rounded-[18px] border border-white/70 bg-white/45">
              {inventory.categories.map((item) => {
                const used = categoryProductCount(item.name, inventory.products);
                return (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-[13.5px] font-medium text-navy">{item.name}</p>
                        {!item.isActive ? (
                          <span className="shrink-0 rounded-full bg-[#eef2f6] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-slate-400">
                            Inactive
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {used === 0 ? "No products" : `${used} product${used === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        setEditing(item);
                      }}
                      className="inline-flex h-7 shrink-0 items-center rounded-full border border-white/80 bg-white/80 px-2.5 text-[12px] font-medium text-navy shadow-[0_4px_10px_rgba(15,35,64,0.05)] transition hover:bg-white"
                    >
                      Edit
                    </button>
                    <CategoryRowMenu
                      category={item}
                      used={used}
                      open={menuId === item.id}
                      onToggle={() => setMenuId((current) => (current === item.id ? null : item.id))}
                      onClose={() => setMenuId(null)}
                      onDelete={() => {
                        setMenuId(null);
                        setConfirm({ type: "delete", category: item });
                      }}
                      onDeactivate={() => {
                        setMenuId(null);
                        setConfirm({ type: "deactivate", category: item });
                      }}
                      onActivate={() => {
                        setMenuId(null);
                        setProductCategoryActive(item.id, true);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <CategoryCreateModal
        open={Boolean(editing)}
        category={editing}
        elevated
        onClose={() => setEditing(null)}
        onUpdated={(previousName, nextName) => {
          onRenamed?.(previousName, nextName);
        }}
      />
      {confirm ? (
        <ConfirmDialog
          category={confirm.category}
          mode={confirm.type}
          used={categoryProductCount(confirm.category.name, inventory.products)}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.type === "delete") {
              const usedNow = categoryProductCount(confirm.category.name, inventory.products);
              if (usedNow > 0) {
                setConfirm({ type: "deactivate", category: confirm.category });
                return;
              }
              const result = deleteProductCategory(confirm.category.id);
              if (result.inUse) {
                setConfirm({ type: "deactivate", category: confirm.category });
                return;
              }
              if (!result.error) onDeleted?.(confirm.category.name);
              setConfirm(null);
              return;
            }
            setProductCategoryActive(confirm.category.id, false);
            setConfirm(null);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function CategoryRowMenu({
  category,
  used,
  open,
  onToggle,
  onClose,
  onDelete,
  onDeactivate,
  onActivate,
}: {
  category: SupermarketCategory;
  used: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 8 });

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
            className="fixed inset-0 z-[108] cursor-default bg-transparent"
            aria-label="Close actions"
            onPointerDown={(event) => {
              event.preventDefault();
              onClose();
            }}
          />
          <div
            className="fixed z-[109] w-44 overflow-hidden rounded-[16px] border border-white/80 bg-white/92 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
            style={{ top: coords.top, right: coords.right }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {!category.isActive ? <MenuItem label="Activate" onSelect={onActivate} /> : null}
            {used > 0 && category.isActive ? <MenuItem label="Deactivate" onSelect={onDeactivate} /> : null}
            {used === 0 ? <MenuItem label="Delete" onSelect={onDelete} tone="danger" /> : null}
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
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/80 text-navy/70 shadow-[0_4px_10px_rgba(15,35,64,0.05)] transition hover:bg-white hover:text-navy"
        aria-label={`More actions for ${category.name}`}
        aria-expanded={open}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {menu}
    </div>
  );
}

function MenuItem({
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
      onClick={onSelect}
      className={cn(
        "flex w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50",
        tone === "danger" ? "text-[#b42318]" : "text-navy",
      )}
    >
      {label}
    </button>
  );
}

function ConfirmDialog({
  category,
  mode,
  used,
  onCancel,
  onConfirm,
}: {
  category: SupermarketCategory;
  mode: "delete" | "deactivate";
  used: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const inUse = mode === "deactivate" || used > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-navy/20" aria-label="Close" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel-enter relative w-full max-w-[380px] rounded-[22px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_50px_rgba(15,35,64,0.16)] backdrop-blur-xl"
      >
        <h3 id={titleId} className="text-[16px] font-semibold tracking-[-0.03em] text-navy">
          {inUse ? "Category is in use" : "Delete category?"}
        </h3>
        <p className="mt-2 text-[13.5px] leading-5 text-slate-500">
          {inUse
            ? "This category is currently assigned to products. Deactivate it instead of deleting it."
            : `Are you sure you want to delete ${category.name}?`}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-full border border-white/80 bg-white/90 px-3.5 text-[13px] font-semibold text-navy"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-full px-3.5 text-[13px] font-semibold text-white",
              inUse ? "bg-[#0b2244]" : "bg-[#8a3a3a]",
            )}
          >
            {inUse ? "Deactivate Category" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
