"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScanLine, X } from "lucide-react";
import { normalizeBarcode } from "@/lib/supermarket/barcode";

type ScannerControls = { stop: () => void };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

const DETECTOR_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];

function createBarcodeDetector() {
  const Detector = (window as unknown as {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }).BarcodeDetector;
  if (!Detector) return null;
  try {
    return new Detector({ formats: DETECTOR_FORMATS });
  } catch {
    return null;
  }
}

function drawScanBand(video: HTMLVideoElement, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return false;
  const bandWidth = Math.max(1, Math.floor(width * 0.9));
  const bandHeight = Math.max(1, Math.floor(height * 0.46));
  const x = Math.floor((width - bandWidth) / 2);
  const y = Math.floor((height - bandHeight) / 2);
  if (canvas.width !== bandWidth) canvas.width = bandWidth;
  if (canvas.height !== bandHeight) canvas.height = bandHeight;
  context.drawImage(video, x, y, bandWidth, bandHeight, 0, 0, bandWidth, bandHeight);
  return true;
}

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

    async function openCamera() {
      const attempts: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: "continuous" }],
          } as unknown as MediaTrackConstraints,
        },
        {
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        },
      ];
      let lastError: unknown;
      for (const constraints of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Camera scanning is unavailable in this browser.");
        return;
      }
      try {
        const stream = await openCamera();
        if (cancelled || closedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopScanner();
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled || closedRef.current) {
          stopScanner();
          return;
        }
        setStatus("Point the camera at a barcode");

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          setStatus("Camera scanning is unavailable in this browser.");
          return;
        }
        const detector = createBarcodeDetector();
        let reader: { decode: (source: HTMLCanvasElement) => string | null } | null = null;
        if (!detector) {
          const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
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
          const fallback = new BrowserMultiFormatOneDReader(hints);
          reader = {
            decode(source) {
              try {
                return fallback.decodeFromCanvas(source).getText();
              } catch {
                return null;
              }
            },
          };
        }

        let busy = false;
        const finish = (raw: string) => {
          const code = normalizeBarcode(raw);
          if (!code || cancelled || closedRef.current) return;
          closedRef.current = true;
          stopScanner();
          onDetected(code);
          onClose();
        };
        const tick = () => {
          if (cancelled || closedRef.current) return;
          if (!busy && video.readyState >= 2 && drawScanBand(video, canvas, context)) {
            busy = true;
            const read = detector
              ? detector.detect(canvas).then((codes) => codes.find((item) => item.rawValue)?.rawValue ?? null)
              : Promise.resolve(reader?.decode(canvas) ?? null);
            void read
              .then((raw) => {
                if (raw) finish(raw);
              })
              .catch(() => undefined)
              .finally(() => {
                busy = false;
              });
          }
          if (!cancelled && !closedRef.current) {
            window.requestAnimationFrame(tick);
          }
        };
        controlsRef.current = { stop: () => undefined };
        tick();
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
