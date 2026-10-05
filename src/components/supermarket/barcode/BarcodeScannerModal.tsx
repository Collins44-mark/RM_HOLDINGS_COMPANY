"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScanLine, X } from "lucide-react";
import { normalizeBarcode } from "@/lib/supermarket/barcode";

type ScannerControls = { stop: () => void };

export function BarcodeScannerModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const closedRef = useRef(false);
  const [status, setStatus] = useState("Point the camera at a barcode");

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    closedRef.current = !open;
    if (!open) {
      stopScanner();
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled && !closedRef.current) {
        setStatus("Barcode not detected. Try again.");
      }
    }, 12000);

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Camera scanning is unavailable in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled || closedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;

        const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
        const { DecodeHintType } = await import("@zxing/library");
        if (cancelled || closedRef.current) {
          stopScanner();
          return;
        }
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromStream(stream, video ?? undefined, (result, error) => {
          if (error && !result) return;
          if (!result || cancelled || closedRef.current) return;
          const code = normalizeBarcode(result.getText());
          if (!code) return;
          closedRef.current = true;
          stopScanner();
          onDetected(code);
          onClose();
        });
        if (cancelled || closedRef.current) {
          controls.stop();
          stopScanner();
          return;
        }
        controlsRef.current = controls;
      } catch (error) {
        if (cancelled || closedRef.current) return;
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStatus("Camera access was denied.");
          return;
        }
        if (name === "NotFoundError" || name === "OverconstrainedError") {
          setStatus("No camera was found.");
          return;
        }
        if (name === "NotReadableError") {
          setStatus("Camera is already in use.");
          return;
        }
        if (name === "SecurityError") {
          setStatus("Camera scanning needs a secure (HTTPS) connection.");
          return;
        }
        setStatus("Camera scanning is unavailable in this browser.");
      }
    }

    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      stopScanner();
    };
  }, [onClose, onDetected, open, stopScanner]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        className="relative w-full max-w-[420px] overflow-hidden rounded-t-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.18)] backdrop-blur-xl sm:rounded-[24px] sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p id="barcode-scanner-title" className="text-[17px] font-semibold tracking-[-0.03em] text-navy">
              Scan Barcode
            </p>
            <p className="mt-1 text-[13px] text-slate-500" aria-live="polite">
              {status}
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white text-slate-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative overflow-hidden rounded-[18px] bg-[#0b1a2e]">
          <video ref={videoRef} className="h-[240px] w-full object-cover sm:h-[280px]" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[88px] w-[78%] rounded-[12px] border-2 border-white/85 shadow-[0_0_0_999px_rgba(7,20,34,0.28)]" />
          </div>
        </div>
        <p className="mt-3 text-center text-[12.5px] text-slate-500">Align barcode inside frame</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-navy text-[14px] font-semibold text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function BarcodeScanButton({
  onDetected,
  className,
  children,
}: {
  onDetected: (barcode: string) => void;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Scan barcode"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children ?? <ScanLine className="h-4 w-4" strokeWidth={1.8} />}
      </button>
      <BarcodeScannerModal open={open} onClose={() => setOpen(false)} onDetected={onDetected} />
    </>
  );
}
