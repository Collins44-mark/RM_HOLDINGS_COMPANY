"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { addProductCategory, updateProductCategory } from "@/lib/data/supermarket-inventory";
import type { SupermarketCategory } from "@/lib/data/supermarket-inventory";
import type { AuthUser } from "@/lib/auth/types";

export const ADD_CATEGORY_OPTION = "__add_category__";
export const MANAGE_CATEGORIES_OPTION = "__manage_categories__";
export const CATEGORY_ACTIONS_SEPARATOR = "__category_actions_sep__";

function hasCategoryPermission(user: AuthUser | null, isSuperAdmin: boolean, permission: string) {
  if (isSuperAdmin) return true;
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission(permission, matcher));
}

export function canCreateSupermarketCategory(user: AuthUser | null, isSuperAdmin: boolean) {
  return hasCategoryPermission(user, isSuperAdmin, "supermarket.categories.create");
}

export function canManageSupermarketCategories(user: AuthUser | null, isSuperAdmin: boolean) {
  return (
    canCreateSupermarketCategory(user, isSuperAdmin) ||
    hasCategoryPermission(user, isSuperAdmin, "supermarket.categories.edit") ||
    hasCategoryPermission(user, isSuperAdmin, "supermarket.categories.delete")
  );
}

export function CategoryDropdownActions({
  canAdd = false,
  canManage = false,
}: {
  canAdd?: boolean;
  canManage?: boolean;
}) {
  if (!canAdd && !canManage) return null;
  return (
    <>
      <option value={CATEGORY_ACTIONS_SEPARATOR} disabled>
        ────────────
      </option>
      {canAdd ? <option value={ADD_CATEGORY_OPTION}>+ Add Category</option> : null}
      {canManage ? <option value={MANAGE_CATEGORIES_OPTION}>Manage Categories</option> : null}
    </>
  );
}

export function CategoryCreateModal({
  open,
  onClose,
  onCreated,
  onUpdated,
  category = null,
  elevated = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (name: string) => void;
  onUpdated?: (previousName: string, nextName: string) => void;
  category?: SupermarketCategory | null;
  elevated?: boolean;
}) {
  const titleId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const editing = Boolean(category);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setDescription(category?.description ?? "");
    setError(null);
    savingRef.current = false;
    setSaving(false);
    const frame = window.requestAnimationFrame(() => nameRef.current?.focus());
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, category, onClose]);

  if (!open || typeof document === "undefined") return null;

  function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    if (category) {
      const result = updateProductCategory(category.id, { name, description });
      if (result.error || !result.category) {
        savingRef.current = false;
        setSaving(false);
        setError(result.error ?? "Couldn't save this category.");
        return;
      }
      onUpdated?.(result.previousName ?? category.name, result.category.name);
      onClose();
      return;
    }
    const result = addProductCategory({ name, description });
    if (result.error || !result.category) {
      savingRef.current = false;
      setSaving(false);
      setError(result.error ?? "Couldn't save this category.");
      return;
    }
    onCreated?.(result.category.name);
    onClose();
  }

  return createPortal(
    <div className={elevated ? "fixed inset-0 z-[105] flex items-center justify-center px-4 py-6" : "fixed inset-0 z-[90] flex items-center justify-center px-4 py-6"}>
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
        className="modal-panel-enter relative w-full max-w-[420px] rounded-[24px] border border-white/80 bg-white/86 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl sm:p-6"
      >
        <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
          {editing ? "Edit Category" : "Add Category"}
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          {editing ? "Update this product category." : "Create a category for products and stock."}
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="block min-w-0" htmlFor={nameId}>
            <span className="mb-1.5 block text-[13px] font-medium text-navy">
              Category Name <span className="text-[#c24646]">*</span>
            </span>
            <input
              ref={nameRef}
              id={nameId}
              value={name}
              onChange={(event) => {
                setName(event.target.value.slice(0, 60));
                setError(null);
              }}
              placeholder="e.g. Snacks"
              className="h-12 w-full rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 text-[14px] text-navy outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10"
            />
          </label>
          <label className="block min-w-0" htmlFor={descriptionId}>
            <span className="mb-1.5 block text-[13px] font-medium text-navy">Description</span>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 160))}
              placeholder="Optional"
              rows={3}
              className="w-full resize-none rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 py-3 text-[14px] text-navy outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10"
            />
          </label>
          {error ? <p className="text-[13px] text-[#8a5a5a]">{error}</p> : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/80 bg-white/90 px-4 text-[13.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22)] transition hover:bg-[#102a52] disabled:pointer-events-none disabled:opacity-70"
            >
              {saving ? "Saving..." : editing ? "Save Changes" : "Save Category"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
