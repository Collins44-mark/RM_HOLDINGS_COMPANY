"use client";

import { useEffect, useRef, type RefObject } from "react";
import { subscribeBarcodeScanner, type BarcodeScannerStatus } from "@/lib/supermarket/barcode-scanner";

export function useHardwareBarcodeScan({
  inputRef,
  onScan,
  onStatus,
  enabled = true,
  captureUnfocused = false,
  handleFocusedEnter = true,
  duplicateWindowMs = 450,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onScan: (barcode: string) => void;
  onStatus?: (status: BarcodeScannerStatus) => void;
  enabled?: boolean;
  captureUnfocused?: boolean;
  handleFocusedEnter?: boolean;
  duplicateWindowMs?: number;
}) {
  const onScanRef = useRef(onScan);
  const onStatusRef = useRef(onStatus);
  onScanRef.current = onScan;
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!enabled) return;
    return subscribeBarcodeScanner({
      getInput: () => inputRef.current,
      captureUnfocused,
      handleFocusedEnter,
      duplicateWindowMs,
      onScan: (barcode) => onScanRef.current(barcode),
      onStatus: (status) => onStatusRef.current?.(status),
    });
  }, [captureUnfocused, duplicateWindowMs, enabled, handleFocusedEnter, inputRef]);
}
