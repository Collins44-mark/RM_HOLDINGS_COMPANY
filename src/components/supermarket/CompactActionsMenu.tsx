"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

export type CompactMenuItem = {
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
};

const MENU_WIDTH = 188;
const ITEM_HEIGHT = 36;
const MENU_PAD = 8;

function menuHeight(count: number) {
  return MENU_PAD + count * ITEM_HEIGHT;
}

function coordsFromButton(button: HTMLButtonElement, count: number) {
  const rect = button.getBoundingClientRect();
  const height = menuHeight(count);
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < height + 8 && rect.top > height + 8;
  const top = openUp
    ? Math.max(8, rect.top - height - 6)
    : Math.min(window.innerHeight - height - 8, rect.bottom + 6);
  const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
  return { top, left };
}

export function CompactActionsMenu({
  items,
  ariaLabel,
  onOpen,
}: {
  items: CompactMenuItem[];
  ariaLabel: string;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onReposition() {
      if (!buttonRef.current) return;
      setCoords(coordsFromButton(buttonRef.current, items.length));
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, items.length]);

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          const button = buttonRef.current;
          if (!button) return;
          if (!open) {
            setCoords(coordsFromButton(button, items.length));
            onOpen?.();
          }
          setOpen((value) => !value);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-[#f4f7fb] hover:text-navy"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
              className="fixed z-[90] overflow-hidden rounded-[14px] border border-white/80 bg-white/95 py-1 shadow-[0_12px_30px_rgba(20,40,70,0.12)] backdrop-blur-md"
            >
              {items.map((item) =>
                item.href && !item.disabled ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    prefetch
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-[13px] font-medium text-navy hover:bg-[#f4f7fb]"
                    onMouseEnter={() => item.onSelect?.()}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className="block w-full px-3 py-2 text-left text-[13px] font-medium text-navy hover:bg-[#f4f7fb] disabled:text-slate-400"
                    onClick={() => {
                      if (item.disabled) return;
                      setOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
