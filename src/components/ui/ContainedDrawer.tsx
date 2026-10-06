"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SIDEBAR_WIDTH } from "@/lib/config/app";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

const EXIT_MS = 220;
const LG_QUERY = "(min-width: 1024px)";

const DrawerCloseContext = createContext<(force?: boolean) => void>(() => {});

export function useContainedDrawerClose() {
  return useContext(DrawerCloseContext);
}

export function DrawerCancel({
  disabled,
  children = "Cancel",
}: {
  disabled?: boolean;
  children?: ReactNode;
}) {
  const close = useContainedDrawerClose();
  return (
    <button type="button" className={secondaryButton} disabled={disabled} onClick={() => close()}>
      {children}
    </button>
  );
}

function subscribeClient() {
  return () => undefined;
}

function clientTrue() {
  return true;
}

function clientFalse() {
  return false;
}

function subscribeLg(onStoreChange: () => void) {
  const media = window.matchMedia(LG_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function lgSnapshot() {
  return window.matchMedia(LG_QUERY).matches;
}

export function ContainedDrawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  dirty = false,
  busy = false,
  closeOnBackdrop = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean;
  busy?: boolean;
  closeOnBackdrop?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closedRef = useRef(false);
  const { collapsed } = useSidebarCollapsed();
  const mounted = useSyncExternalStore(subscribeClient, clientTrue, clientFalse);
  const desktop = useSyncExternalStore(subscribeLg, lgSnapshot, clientFalse);
  const [leaving, setLeaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      restoreFocusRef.current?.focus?.();
      onClose();
    }, EXIT_MS);
  }, [onClose]);

  const requestClose = useCallback(
    (force = false) => {
      if (closedRef.current) return;
      if (busy && !force) return;
      if (dirty && !force) {
        setDiscardOpen(true);
        return;
      }
      finishClose();
    },
    [busy, dirty, finishClose],
  );

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = panelRef.current?.querySelector<HTMLElement>("[data-drawer-body]");
    const target = body?.querySelector<HTMLElement>("input, select, textarea") ?? headingRef.current;
    target?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) {
        setDiscardOpen(false);
        return;
      }
      requestClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [discardOpen, requestClose]);

  if (!mounted) return null;

  const left = desktop ? (collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded) + 12 : 0;

  return createPortal(
    <DrawerCloseContext.Provider value={requestClose}>
      <div
        className="pointer-events-none fixed top-14 right-0 bottom-0 z-[25] sm:top-[72px]"
        style={{ left }}
      >
        <button
          type="button"
          className={cn(
            "pointer-events-auto absolute inset-0 bg-[#0b2244]/18 transition-opacity duration-[220ms] ease-out",
            leaving ? "opacity-0" : "animate-[rm-contained-drawer-backdrop-in_220ms_ease-out_both]",
          )}
          aria-label="Close"
          onClick={() => {
            if (!closeOnBackdrop) return;
            requestClose();
          }}
        />
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "pointer-events-auto absolute top-4 right-0 bottom-4 flex w-full max-w-none flex-col overflow-hidden rounded-l-[24px] border border-white/80 border-r-0 bg-white/92 shadow-[-28px_0_64px_rgba(15,35,64,0.14),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl sm:top-5 sm:bottom-5 sm:w-[min(100%,520px)]",
            "transition-[transform,opacity] duration-[220ms] ease-out",
            leaving
              ? "translate-x-full opacity-0"
              : "translate-x-0 opacity-100 animate-[rm-contained-drawer-in_220ms_ease-out]",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5">
            <div className="min-w-0">
              <h2
                id={titleId}
                ref={headingRef}
                tabIndex={-1}
                className="text-[18px] font-semibold tracking-[-0.03em] text-navy outline-none"
              >
                {title}
              </h2>
              {subtitle ? <p className="mt-0.5 truncate text-[13px] text-slate-500">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => requestClose()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/[0.04] text-slate-500 transition hover:text-navy"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div data-drawer-body className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>
          {footer ? (
            <div className="flex shrink-0 justify-end gap-2 border-t border-black/[0.04] bg-white/80 px-5 py-3.5">
              {footer}
            </div>
          ) : null}
          {discardOpen ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b2244]/12 px-5">
              <div className="w-full max-w-[320px] rounded-[20px] border border-white/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,35,64,0.16)]">
                <p className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Discard changes?</p>
                <p className="mt-1.5 text-[13px] leading-5 text-slate-500">Entered data on this form will be lost.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className={secondaryButton} onClick={() => setDiscardOpen(false)}>
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className={cn(primaryButton, "bg-[#c45b66] shadow-[0_10px_22px_rgba(196,91,102,0.22)] hover:bg-[#b44f59]")}
                    onClick={() => {
                      setDiscardOpen(false);
                      finishClose();
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </DrawerCloseContext.Provider>,
    document.body,
  );
}
