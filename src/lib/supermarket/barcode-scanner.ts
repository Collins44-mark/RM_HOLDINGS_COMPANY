import { createScanGate, isPlausibleBarcode, normalizeBarcode } from "@/lib/supermarket/barcode";

/** Gaps at or below this are treated as a hardware wedge burst, not manual typing. */
export const SCAN_INTER_KEY_MS = 50;
/** Finish a fast burst when the scanner does not send Enter or Tab. */
export const SCAN_IDLE_MS = 90;
const DUPLICATE_GUARD_MS = 450;
const ENTER_SWALLOW_MS = 250;

export type BarcodeScannerStatus = "ready" | "input-detected" | "disconnected";

export type ScanAssemblerResult = "ignore" | "pending" | "burst";

/**
 * Pure keystroke assembler. A scan is a fast, plausible burst finished by
 * Enter, Tab, or a short idle. Slow typing never completes a scan.
 */
export class ScanAssembler {
  private text = "";
  private lastAt = -1;
  private fast = false;

  push(char: string, now: number): ScanAssemblerResult {
    if (char.length !== 1) return "ignore";
    const gap = this.lastAt < 0 ? Number.POSITIVE_INFINITY : now - this.lastAt;
    this.lastAt = now;
    if (!this.text || gap > SCAN_INTER_KEY_MS) {
      this.text = char;
      this.fast = false;
      return "pending";
    }
    this.text += char;
    this.fast = true;
    if (this.text.length > 48) {
      this.reset();
      return "ignore";
    }
    return "burst";
  }

  /** Enter/Tab, or an idle flush. Returns a barcode only for a fast plausible burst. */
  finish(): string {
    const code = this.fast && isPlausibleBarcode(this.text) ? normalizeBarcode(this.text) : "";
    this.reset();
    return code;
  }

  idleReady(now: number) {
    return this.fast && this.lastAt >= 0 && now - this.lastAt >= SCAN_IDLE_MS;
  }

  reset() {
    this.text = "";
    this.lastAt = -1;
    this.fast = false;
  }
}

export function decodeHidBarcodeReport(data: DataView) {
  let text = "";
  for (let index = 0; index < data.byteLength; index += 1) {
    const byte = data.getUint8(index);
    if (byte >= 32 && byte <= 126) {
      text += String.fromCharCode(byte);
      continue;
    }
    if (text && (byte === 0 || byte === 9 || byte === 10 || byte === 13)) break;
  }
  const code = normalizeBarcode(text);
  return isPlausibleBarcode(code) ? code : "";
}

type HidDeviceLike = {
  vendorId?: number;
  productId?: number;
  opened?: boolean;
  collections?: Array<{ usagePage?: number }>;
  open: () => Promise<void>;
  close?: () => Promise<void>;
  addEventListener: (type: "inputreport", listener: (event: { data: DataView }) => void) => void;
};

type HidApi = {
  getDevices: () => Promise<HidDeviceLike[]>;
  requestDevice: (options: { filters: Array<{ usagePage: number }> }) => Promise<HidDeviceLike[]>;
  addEventListener: (type: "connect" | "disconnect", listener: (event: { device: HidDeviceLike }) => void) => void;
};

type Subscriber = {
  getInput: () => HTMLInputElement | null;
  captureUnfocused: boolean;
  handleFocusedEnter: boolean;
  onScan: (barcode: string) => void;
  onStatus?: (status: BarcodeScannerStatus) => void;
  gate: (code: string) => boolean;
};

const subscribers = new Set<Subscriber>();
const assembler = new ScanAssembler();
const knownHid = new Set<string>();
let listening = false;
let hidWatching = false;
let idleTimer = 0;
let lastCommitAt = 0;
let lead: { element: HTMLInputElement | HTMLTextAreaElement; char: string } | null = null;

function hidApi(): HidApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { hid?: HidApi }).hid ?? null;
}

function deviceKey(device: { vendorId?: number; productId?: number }) {
  return `${device.vendorId ?? 0}:${device.productId ?? 0}`;
}

function broadcast(status: BarcodeScannerStatus) {
  for (const subscriber of subscribers) subscriber.onStatus?.(status);
}

function captures(target: EventTarget | null) {
  for (const subscriber of subscribers) {
    if (subscriber.captureUnfocused || subscriber.getInput() === target) return true;
  }
  return false;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function deliver(code: string) {
  const barcode = normalizeBarcode(code);
  if (!isPlausibleBarcode(barcode)) return;
  lastCommitAt = performance.now();
  assembler.reset();
  lead = null;
  window.clearTimeout(idleTimer);
  broadcast("ready");
  for (const subscriber of subscribers) {
    if (!subscriber.gate(barcode)) continue;
    subscriber.onScan(barcode);
  }
}

function rememberLead(target: EventTarget | null, char: string) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    lead = { element: target, char };
    return;
  }
  lead = null;
}

function stripLead() {
  if (!lead) return;
  const { element, char } = lead;
  lead = null;
  if (element.value.endsWith(char)) setNativeValue(element, element.value.slice(0, -1));
}

function scheduleIdle() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!assembler.idleReady(performance.now())) return;
    const code = assembler.finish();
    if (code) deliver(code);
    else broadcast("ready");
  }, SCAN_IDLE_MS);
}

function onKeyDown(event: KeyboardEvent) {
  if (!subscribers.size || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!captures(event.target)) return;
  const now = performance.now();

  if (event.key === "Enter" || event.key === "Tab") {
    if (now - lastCommitAt < ENTER_SWALLOW_MS) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const scanned = assembler.finish();
    if (scanned) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deliver(scanned);
      return;
    }
    if (event.key === "Enter") {
      const owner = [...subscribers].find(
        (subscriber) => subscriber.handleFocusedEnter && subscriber.getInput() === event.target,
      );
      if (owner && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        deliver(owner.getInput()?.value || event.target.value);
      }
    }
    return;
  }

  if (event.key.length !== 1) return;
  const result = assembler.push(event.key, now);
  if (result === "pending") {
    rememberLead(event.target, event.key);
    return;
  }
  if (result !== "burst") return;
  event.preventDefault();
  stripLead();
  broadcast("input-detected");
  scheduleIdle();
}

function onHidReport(data: DataView) {
  const code = decodeHidBarcodeReport(data);
  if (code) deliver(code);
}

async function openPosHidDevice(device: HidDeviceLike, force = false) {
  const posMode = force || device.collections?.some((collection) => collection.usagePage === 0x8c);
  if (!posMode) return;
  knownHid.add(deviceKey(device));
  if (!device.opened) await device.open();
  device.addEventListener("inputreport", (event) => onHidReport(event.data));
}

function watchHid() {
  const hid = hidApi();
  if (!hid || hidWatching) return;
  hidWatching = true;
  void hid.getDevices().then((devices) => {
    for (const device of devices) void openPosHidDevice(device).catch(() => undefined);
  });
  hid.addEventListener("disconnect", (event) => {
    const key = deviceKey(event.device);
    if (!knownHid.has(key)) return;
    knownHid.delete(key);
    broadcast("disconnected");
  });
  hid.addEventListener("connect", (event) => {
    void openPosHidDevice(event.device)
      .then(() => {
        if (knownHid.has(deviceKey(event.device))) broadcast("ready");
      })
      .catch(() => undefined);
  });
}

function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, true);
  watchHid();
}

function releaseListener() {
  if (subscribers.size || !listening || typeof window === "undefined") return;
  listening = false;
  window.removeEventListener("keydown", onKeyDown, true);
  window.clearTimeout(idleTimer);
  assembler.reset();
  lead = null;
}

export function subscribeBarcodeScanner(subscriber: Omit<Subscriber, "gate"> & { duplicateWindowMs?: number }) {
  const entry: Subscriber = {
    ...subscriber,
    gate: createScanGate(subscriber.duplicateWindowMs ?? DUPLICATE_GUARD_MS),
  };
  subscribers.add(entry);
  ensureListener();
  subscriber.onStatus?.("ready");
  return () => {
    subscribers.delete(entry);
    releaseListener();
  };
}

/** Explicit permission and device choice for scanners that speak HID POS, not keyboard wedge. */
export async function requestBarcodeHidDevice() {
  const hid = hidApi();
  if (!hid) return false;
  ensureListener();
  watchHid();
  try {
    const devices = await hid.requestDevice({ filters: [{ usagePage: 0x8c }] });
    for (const device of devices) {
      knownHid.add(deviceKey(device));
      await openPosHidDevice(device, true);
    }
    return devices.length > 0;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotFoundError" || name === "NotAllowedError" || name === "SecurityError") return false;
    return false;
  }
}

export function hidScannerAvailable() {
  return hidApi() !== null;
}
