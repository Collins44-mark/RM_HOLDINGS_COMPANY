"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { inputClass } from "@/components/supermarket/purchasing-ui";

export type SchoolDrawerSelectOption = {
  value: string;
  label: string;
};

export function SchoolDrawerSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Select",
}: {
  value: string;
  options: SchoolDrawerSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, maxHeight: 220 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((row) => row.value === value);

  function place(button: HTMLButtonElement, drawer: HTMLElement) {
    const trigger = button.getBoundingClientRect();
    const panel = drawer.getBoundingClientRect();
    const width = trigger.width;
    const left = Math.min(Math.max(8, trigger.left - panel.left), Math.max(8, panel.width - width - 16));
    const below = panel.bottom - trigger.bottom - 16;
    const above = trigger.top - panel.top - 16;
    const openUp = below < 132 && above > below;
    const maxHeight = Math.max(96, Math.min(220, openUp ? above : below));
    const top = openUp ? trigger.top - panel.top - maxHeight - 6 : trigger.bottom - panel.top + 6;
    setCoords({ top, left, width, maxHeight });
  }

  function openMenu() {
    const button = buttonRef.current;
    const drawer = button?.closest("[role='dialog']");
    if (!button || !(drawer instanceof HTMLElement) || !options.length) return;
    setHost(drawer);
    setActive(Math.max(0, options.findIndex((row) => row.value === value)));
    place(button, drawer);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const drawer = host;
    const scrollRoot = button?.closest("[data-drawer-body]");
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() {
      if (!button || !drawer) return;
      place(button, drawer);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onReposition);
    scrollRoot?.addEventListener("scroll", onReposition);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onReposition);
      scrollRoot?.removeEventListener("scroll", onReposition);
    };
  }, [open, host]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + delta + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const row = options[active];
      if (row) choose(row.value);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
        className={cn(inputClass, "flex items-center justify-between gap-2 text-left")}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.85} />
      </button>
      {open && host
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight }}
              className="absolute z-30 overflow-y-auto rounded-[14px] border border-white/80 bg-white/96 py-1 shadow-[0_12px_28px_rgba(15,35,64,0.14)] backdrop-blur-xl"
            >
              {options.map((row, index) => (
                <li key={row.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={row.value === value}
                    className={cn(
                      "flex w-full px-3 py-2 text-left text-[13.5px] text-navy",
                      row.value === value ? "font-semibold" : "font-medium",
                      index === active ? "bg-navy/[0.06]" : "hover:bg-navy/[0.04]",
                    )}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(row.value)}
                  >
                    <span className="truncate">{row.label}</span>
                  </button>
                </li>
              ))}
            </ul>,
            host,
          )
        : null}
    </div>
  );
}
