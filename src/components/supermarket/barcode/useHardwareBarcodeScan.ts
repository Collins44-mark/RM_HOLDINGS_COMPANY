"use client";

import { useEffect, type RefObject } from "react";
import { createScanGate, normalizeBarcode } from "@/lib/supermarket/barcode";

const WEDGE_GAP_MS = 120;
const WEDGE_RESET_MS = 500;

export function useHardwareBarcodeScan({
  inputRef,
  onScan,
  enabled = true,
  captureUnfocused = false,
  handleFocusedEnter = true,
  duplicateWindowMs = 400,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onScan: (barcode: string) => void;
  enabled?: boolean;
  captureUnfocused?: boolean;
  handleFocusedEnter?: boolean;
  duplicateWindowMs?: number;
}) {
  useEffect(() => {
    if (!enabled) return;
    const gate = createScanGate(duplicateWindowMs);
    let buffer = "";
    let lastKeyAt = 0;

    function emit(raw: string) {
      const code = normalizeBarcode(raw);
      if (!code || !gate(code)) return;
      onScan(code);
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const input = inputRef.current;
      const inField = Boolean(input && (target === input || input.contains(target)));
      const typingElsewhere =
        !inField &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target?.isContentEditable);

      if (event.key === "Enter") {
        if (inField) {
          if (!handleFocusedEnter) return;
          event.preventDefault();
          const value = input?.value || buffer;
          buffer = "";
          emit(value);
          return;
        }
        if (captureUnfocused && !typingElsewhere && buffer) {
          event.preventDefault();
          const value = buffer;
          buffer = "";
          emit(value);
        }
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const now = Date.now();
      const gap = lastKeyAt ? now - lastKeyAt : Number.POSITIVE_INFINITY;
      lastKeyAt = now;
      if (gap > WEDGE_RESET_MS) buffer = "";

      if (inField) return;

      if (captureUnfocused && !typingElsewhere) {
        buffer += event.key;
        if (gap <= WEDGE_GAP_MS) event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [captureUnfocused, duplicateWindowMs, enabled, handleFocusedEnter, inputRef, onScan]);
}
