"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

const MENU_WIDTH = 148;
const MENU_HEIGHT = 88;

export function UserActionsMenu({
  onView,
  onCustomize,
  customizeDisabled,
}: {
  onView: () => void;
  onCustomize: () => void;
  customizeDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function coordsFromButton(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_HEIGHT + 8 && rect.top > MENU_HEIGHT + 8;
    const top = openUp
      ? Math.max(8, rect.top - MENU_HEIGHT - 6)
      : Math.min(window.innerHeight - MENU_HEIGHT - 8, rect.bottom + 6);
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    return { top, left };
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() {
      if (!buttonRef.current) return;
      setCoords(coordsFromButton(buttonRef.current));
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="User actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          const button = buttonRef.current;
          if (!button) return;
          if (!open) setCoords(coordsFromButton(button));
          setOpen((value) => !value);
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-[#f4f7fb] hover:text-navy"
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
              className="fixed z-[80] overflow-hidden rounded-[14px] border border-white/80 bg-white/95 py-1 shadow-[0_12px_30px_rgba(20,40,70,0.12)] backdrop-blur-md"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-[13px] font-medium text-navy hover:bg-[#f4f7fb]"
                onClick={() => {
                  setOpen(false);
                  onView();
                }}
              >
                View
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={customizeDisabled}
                className="block w-full px-3 py-2 text-left text-[13px] font-medium text-navy hover:bg-[#f4f7fb] disabled:text-slate-400"
                onClick={() => {
                  if (customizeDisabled) return;
                  setOpen(false);
                  onCustomize();
                }}
              >
                Customize
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
