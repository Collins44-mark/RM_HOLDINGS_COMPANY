import { APP_TIMEZONE } from "@/lib/config/app";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import { type PosCompletedSale } from "@/lib/data/sample-supermarket-pos";
import { type SupermarketReceiptDetails } from "@/lib/supermarket/receipt-profile";

const RECEIPT_COLS = 32;
const SERIAL_BAUD = 9600;

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SerialApi = {
  getPorts: () => Promise<SerialPortLike[]>;
  requestPort: () => Promise<SerialPortLike>;
  addEventListener: (type: "disconnect", listener: (event: Event) => void) => void;
};

export type PosPrintResult =
  | { status: "printed"; method: "system" | "escpos" | "bluetooth" }
  | { status: "need-permission" }
  | { status: "no-printer" }
  | { status: "cancelled" };

export type ReceiptPrinterChoice = {
  id: string;
  label: string;
  kind: "serial" | "bluetooth";
};

const BLUETOOTH_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];

type BluetoothCharacteristicLike = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};

type BluetoothServiceLike = {
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
};

type BluetoothServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothServerLike>;
  getPrimaryService: (uuid: string) => Promise<BluetoothServiceLike>;
};

type BluetoothDeviceLike = {
  id: string;
  name?: string;
  gatt?: BluetoothServerLike | null;
  addEventListener: (type: "gattserverdisconnected", listener: () => void) => void;
};

type BluetoothApi = {
  getDevices?: () => Promise<BluetoothDeviceLike[]>;
  requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BluetoothDeviceLike>;
};

let rememberedPort: SerialPortLike | null = null;
let grantedSerialPorts: SerialPortLike[] = [];
let rememberedBluetooth: BluetoothDeviceLike | null = null;
let grantedBluetooth: BluetoothDeviceLike[] = [];
let disconnectBound = false;

function serialApi(): SerialApi | null {
  if (typeof navigator === "undefined") return null;
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  return serial ?? null;
}

export function isEscPosSupported() {
  return serialApi() !== null;
}

function bluetoothApi(): BluetoothApi | null {
  if (typeof navigator === "undefined") return null;
  const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
  return bluetooth ?? null;
}

export function isBluetoothPrintSupported() {
  return bluetoothApi() !== null;
}

function serialLabel(port: SerialPortLike, index: number) {
  const info = (port as SerialPortLike & { getInfo?: () => { usbVendorId?: number; usbProductId?: number } }).getInfo?.();
  if (info?.usbVendorId) {
    const vendor = info.usbVendorId.toString(16);
    const product = info.usbProductId?.toString(16) ?? "0";
    return `USB printer ${vendor}:${product}`;
  }
  return `Connected printer ${index + 1}`;
}

export async function listConnectedReceiptPrinters(): Promise<ReceiptPrinterChoice[]> {
  bindDisconnect();
  const found: ReceiptPrinterChoice[] = [];
  const serial = serialApi();
  if (serial) {
    try {
      grantedSerialPorts = await serial.getPorts();
      grantedSerialPorts.forEach((port, index) => {
        found.push({ id: `serial:${index}`, label: serialLabel(port, index), kind: "serial" });
      });
    } catch {
      grantedSerialPorts = [];
    }
  }
  const bluetooth = bluetoothApi();
  if (bluetooth?.getDevices) {
    try {
      grantedBluetooth = await bluetooth.getDevices();
      for (const device of grantedBluetooth) {
        found.push({
          id: `bluetooth:${device.id}`,
          label: device.name?.trim() || "Bluetooth printer",
          kind: "bluetooth",
        });
      }
    } catch {
      grantedBluetooth = [];
    }
  }
  return found;
}

export function selectReceiptPrinter(id: string) {
  if (id.startsWith("serial:")) {
    const port = grantedSerialPorts[Number(id.slice("serial:".length))] ?? null;
    rememberedPort = port;
    return port ? "serial" : null;
  }
  if (id.startsWith("bluetooth:")) {
    const device = grantedBluetooth.find((item) => item.id === id.slice("bluetooth:".length)) ?? null;
    rememberedBluetooth = device;
    return device ? "bluetooth" : null;
  }
  return null;
}

function bindDisconnect() {
  const serial = serialApi();
  if (!serial || disconnectBound) return;
  disconnectBound = true;
  serial.addEventListener("disconnect", (event) => {
    if (event.target === rememberedPort) rememberedPort = null;
  });
}

export async function hasGrantedEscPosPrinter() {
  bindDisconnect();
  if (rememberedPort) return true;
  const serial = serialApi();
  if (!serial) return false;
  try {
    const ports = await serial.getPorts();
    rememberedPort = ports[0] ?? null;
    return Boolean(rememberedPort);
  } catch {
    return false;
  }
}

export async function connectEscPosPrinter() {
  bindDisconnect();
  const serial = serialApi();
  if (!serial) return null;
  const port = await serial.requestPort();
  rememberedPort = port;
  if (!grantedSerialPorts.includes(port)) grantedSerialPorts = [...grantedSerialPorts, port];
  return port;
}

export async function connectBluetoothPrinter() {
  const bluetooth = bluetoothApi();
  if (!bluetooth) return null;
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLUETOOTH_SERVICES,
  });
  rememberedBluetooth = device;
  device.addEventListener("gattserverdisconnected", () => {
    if (rememberedBluetooth === device) rememberedBluetooth = device;
  });
  if (!grantedBluetooth.some((item) => item.id === device.id)) {
    grantedBluetooth = [...grantedBluetooth, device];
  }
  return device;
}

async function writableCharacteristic(device: BluetoothDeviceLike) {
  const server = device.gatt;
  if (!server) return null;
  const connected = server.connected ? server : await server.connect();
  for (const uuid of BLUETOOTH_SERVICES) {
    try {
      const service = await connected.getPrimaryService(uuid);
      const characteristics = await service.getCharacteristics();
      const match = characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write);
      if (match) return match;
    } catch {
      // This printer does not expose that service.
    }
  }
  return null;
}

async function writeBluetooth(characteristic: BluetoothCharacteristicLike, bytes: Uint8Array) {
  const size = characteristic.properties.writeWithoutResponse ? 180 : 20;
  for (let index = 0; index < bytes.length; index += size) {
    const chunk = bytes.slice(index, index + size);
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
  }
}

export async function printReceiptViaBluetooth(
  sale: PosCompletedSale,
  profile?: SupermarketReceiptDetails,
): Promise<PosPrintResult> {
  const bluetooth = bluetoothApi();
  if (!bluetooth) return { status: "no-printer" };
  const device = rememberedBluetooth;
  if (!device) return { status: "need-permission" };
  try {
    const characteristic = await writableCharacteristic(device);
    if (!characteristic) return { status: "no-printer" };
    await writeBluetooth(characteristic, buildEscPosBytes(sale, profile));
    return { status: "printed", method: "bluetooth" };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotFoundError" || name === "NotAllowedError" || name === "SecurityError") {
      return { status: "need-permission" };
    }
    return { status: "no-printer" };
  }
}

function asAmount(value: number | undefined | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function asText(value: string | undefined | null) {
  const next = value?.trim() ?? "";
  return next || "—";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReceiptStamp(date: Date) {
  const safe = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  }).formatToParts(safe);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const monthIndex = Math.max(0, Number(read("month") || "1") - 1);
  const day = String(Number(read("day") || "1"));
  const hour = read("hour");
  const minute = read("minute");
  const dayPeriod = read("dayPeriod");
  return `${day} ${months[monthIndex] ?? "Jan"} ${read("year")} ${hour}:${minute} ${dayPeriod}`;
}

function invoiceLabel(sale: PosCompletedSale) {
  const invoice = asText(sale.invoice).replace(/^#/, "");
  return `#${invoice}`;
}

function receiptStoreName(sale: PosCompletedSale) {
  const name = sale.store?.trim() ?? "";
  if (!name || name === "—") return "";
  return name;
}

function receiptProfile(sale: PosCompletedSale, profile?: SupermarketReceiptDetails): SupermarketReceiptDetails {
  return {
    storeName: profile?.storeName?.trim() || receiptStoreName(sale),
    location: profile?.location?.trim() ?? "",
    mobile: profile?.mobile?.trim() ?? "",
    tin: profile?.tin?.trim() ?? "",
    email: profile?.email?.trim() ?? "",
    thanks: profile?.thanks?.trim() ?? "",
  };
}

function centeredDetail(label: string, value: string) {
  const text = value.trim();
  if (!text) return "";
  return `<p class="center">${escapeHtml(label)} ${escapeHtml(text)}</p>`;
}

function customerName(value: string | undefined | null) {
  const name = value?.trim() ?? "";
  if (!name || name === "—" || /^walk[-\s]?in(\s+customer)?$/i.test(name)) return "";
  return name;
}

function itemRows(sale: PosCompletedSale) {
  return sale.items.map((item) => {
    const quantity = Math.max(0, Math.round(asAmount(item.quantity) || item.quantity || 0));
    const unitPrice = asAmount(item.unitPrice);
    const lineTotal = asAmount(item.unitPrice * item.quantity);
    return {
      name: asText(item.name),
      quantity: quantity || 0,
      unitPrice,
      lineTotal,
    };
  });
}

export function buildPosReceiptHtml(sale: PosCompletedSale, profile?: SupermarketReceiptDetails) {
  const items = itemRows(sale);
  const itemMarkup = items
    .map(
      (item) => `<div class="item-line">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="num">${item.quantity}</span>
        <span class="num">${escapeHtml(formatAmount(item.unitPrice))}</span>
        <span class="num">${escapeHtml(formatAmount(item.lineTotal))}</span>
      </div>`,
    )
    .join("");

  const namedCustomer = customerName(sale.customer);
  const details = receiptProfile(sale, profile);
  const customerMarkup = namedCustomer
    ? `<p><span class="label">Customer:</span><span class="value">${escapeHtml(namedCustomer)}</span></p>`
    : "";
  const brand = [
    details.storeName ? `<h1>${escapeHtml(details.storeName)}</h1>` : "",
    details.location ? `<p class="center">${escapeHtml(details.location)}</p>` : "",
    centeredDetail("Mobile:", details.mobile),
    centeredDetail("TIN:", details.tin),
    centeredDetail("Email:", details.email),
  ].join("");
  const thanks = details.thanks ? `<p class="thanks">${escapeHtml(details.thanks)}</p>` : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${escapeHtml(invoiceLabel(sale))}</title>
    <style>
      @page { size: 80mm auto; margin: 3mm 2.5mm; }
      @page receipt58 { size: 58mm auto; margin: 2mm; }
      html, body {
        margin: 0;
        padding: 0;
        height: auto;
        min-height: 0;
        background: #fff;
        color: #111;
      }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 12px;
        font-weight: 400;
        line-height: 1.35;
        width: 72mm;
        max-width: 100%;
      }
      .receipt {
        width: 72mm;
        max-width: 100%;
        height: auto;
        box-sizing: border-box;
        padding: 2mm 1.5mm 12mm;
        color: #111;
        background: #fff;
      }
      h1 {
        margin: 0 0 6px;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-align: center;
      }
      .center {
        margin: 0 0 2px;
        text-align: center;
        font-weight: 400;
      }
      .meta { margin: 0 0 8px; }
      .meta p {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 4px;
      }
      .label {
        font-weight: 400;
        color: #111;
      }
      .value {
        text-align: right;
        font-weight: 400;
      }
      .rule {
        margin: 8px 0;
        border: 0;
        border-top: 1px solid #d7d7d7;
      }
      .cols, .item-line {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) 2.4em 4.4em 4.8em;
        column-gap: 6px;
        align-items: baseline;
      }
      .cols {
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: #333;
      }
      .item-line { margin: 0 0 6px; }
      .item-name { font-weight: 500; overflow-wrap: anywhere; }
      .num { text-align: right; font-weight: 400; font-variant-numeric: tabular-nums; }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .total {
        margin-top: 4px;
        font-weight: 700;
        font-size: 14px;
      }
      .thanks {
        margin: 10px 0 0;
        text-align: center;
        font-weight: 400;
        color: #111;
      }
      @media print {
        html, body {
          background: #fff !important;
          color: #000 !important;
          width: auto;
          height: auto;
        }
        .receipt {
          width: 72mm;
          max-width: 100%;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <article class="receipt">
      ${brand}
      ${brand ? `<hr class="rule" />` : ""}
      <div class="meta">
        <p><span class="label">Invoice:</span><span class="value">${escapeHtml(invoiceLabel(sale))}</span></p>
        <p><span class="label">Date &amp; Time:</span><span class="value">${escapeHtml(formatReceiptStamp(sale.soldAt))}</span></p>
        <p><span class="label">Cashier:</span><span class="value">${escapeHtml(asText(sale.cashier))}</span></p>
        ${customerMarkup}
      </div>
      <hr class="rule" />
      <p class="cols"><span>ITEM</span><span class="num">QTY</span><span class="num">PRICE</span><span class="num">TOTAL</span></p>
      ${itemMarkup}
      <hr class="rule" />
      <div class="row total"><span>TOTAL</span><span>${escapeHtml(formatTzs(asAmount(sale.totalDue)))}</span></div>
      <hr class="rule" />
      ${thanks}
    </article>
  </body>
</html>`;
}

export async function printReceiptViaSystem(
  sale: PosCompletedSale,
  profile?: SupermarketReceiptDetails,
): Promise<PosPrintResult> {
  if (typeof document === "undefined") return { status: "no-printer" };
  const html = buildPosReceiptHtml(sale, profile);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "POS Receipt");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "80mm";
  iframe.style.height = "1400px";
  iframe.style.border = "0";
  iframe.style.background = "#fff";

  const printed = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const onLoad = () => {
      if (settled) return;
      const frameWindow = iframe.contentWindow;
      const receipt = iframe.contentDocument?.querySelector(".receipt");
      if (!frameWindow || !receipt) return;
      const height = Math.ceil(receipt.scrollHeight);
      iframe.style.height = `${height + 24}px`;
      const pageMm = Math.max(40, Math.ceil((height + 24) * 25.4 / 96) + 4);
      const pageStyle = iframe.contentDocument?.createElement("style");
      if (pageStyle) {
        pageStyle.textContent = `@page { size: 80mm ${pageMm}mm; margin: 3mm 2.5mm; }`;
        iframe.contentDocument?.head.appendChild(pageStyle);
      }
      const cleanup = () => {
        iframe.remove();
      };
      frameWindow.addEventListener("afterprint", cleanup, { once: true });
      try {
        frameWindow.focus();
        frameWindow.print();
        finish(true);
      } catch {
        cleanup();
        finish(false);
      }
    };
    iframe.addEventListener("load", onLoad);
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    if (iframe.contentDocument?.querySelector(".receipt")) onLoad();
  });

  return printed ? { status: "printed", method: "system" } : { status: "no-printer" };
}

function encodeAscii(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes.push(code < 128 ? code : 63);
  }
  return bytes;
}

function padRow(left: string, right: string, width = RECEIPT_COLS) {
  const cleanLeft = left.slice(0, width);
  const cleanRight = right.slice(0, width);
  const space = Math.max(1, width - cleanLeft.length - cleanRight.length);
  return `${cleanLeft}${" ".repeat(space)}${cleanRight}`.slice(0, width);
}

function centerLine(value: string, width = RECEIPT_COLS) {
  const text = value.slice(0, width);
  const space = Math.max(0, width - text.length);
  const left = Math.floor(space / 2);
  return `${" ".repeat(left)}${text}`;
}

function centeredChunks(value: string, width = RECEIPT_COLS) {
  const text = value.trim();
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += width) {
    lines.push(centerLine(text.slice(index, index + width), width));
  }
  return lines;
}

function rule() {
  return "-".repeat(RECEIPT_COLS);
}

function receiptColumns(item: string, qty: string, price: string, total: string, width = RECEIPT_COLS) {
  const qtyText = qty.slice(0, 3).padStart(3);
  const priceText = price.slice(0, 7).padStart(7);
  const totalText = total.slice(0, 7).padStart(7);
  const itemWidth = Math.max(4, width - (qtyText.length + priceText.length + totalText.length + 3));
  return `${item.slice(0, itemWidth).padEnd(itemWidth)} ${qtyText} ${priceText} ${totalText}`.slice(0, width);
}

export function buildEscPosBytes(sale: PosCompletedSale, profile?: SupermarketReceiptDetails) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const chunks: number[] = [ESC, 0x40, ESC, 0x61, 0x00];
  const write = (line = "") => {
    chunks.push(...encodeAscii(line), 0x0a);
  };
  const bold = (on: boolean) => {
    chunks.push(ESC, 0x45, on ? 0x01 : 0x00);
  };

  const details = receiptProfile(sale, profile);
  if (details.storeName) {
    bold(true);
    for (const line of centeredChunks(details.storeName)) write(line);
    bold(false);
  }
  if (details.location) for (const line of centeredChunks(details.location)) write(line);
  if (details.mobile) for (const line of centeredChunks(`Mobile: ${details.mobile}`)) write(line);
  if (details.tin) for (const line of centeredChunks(`TIN: ${details.tin}`)) write(line);
  if (details.email) for (const line of centeredChunks(`Email: ${details.email}`)) write(line);
  write(rule());
  write(padRow("Invoice:", invoiceLabel(sale)));
  write(padRow("Date & Time:", formatReceiptStamp(sale.soldAt)));
  write(padRow("Cashier:", asText(sale.cashier)));
  const namedCustomer = customerName(sale.customer);
  if (namedCustomer) write(padRow("Customer:", namedCustomer));
  write(rule());
  write(receiptColumns("ITEM", "QTY", "PRICE", "TOTAL"));
  for (const item of itemRows(sale)) {
    write(receiptColumns(item.name, String(item.quantity), formatAmount(item.unitPrice), formatAmount(item.lineTotal)));
  }
  write(rule());
  bold(true);
  write(padRow("TOTAL", formatTzs(asAmount(sale.totalDue))));
  bold(false);
  write(rule());
  if (details.thanks) {
    write();
    for (const line of centeredChunks(details.thanks)) write(line);
  }
  write();
  write();
  chunks.push(GS, 0x56, 0x00);
  return new Uint8Array(chunks);
}

async function ensurePortOpen(port: SerialPortLike) {
  try {
    await port.open({ baudRate: SERIAL_BAUD });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/already open|InvalidStateError/i.test(message) && !(error instanceof DOMException && error.name === "InvalidStateError")) {
      throw error;
    }
  }
}

export async function printReceiptViaEscPos(
  sale: PosCompletedSale,
  profile?: SupermarketReceiptDetails,
): Promise<PosPrintResult> {
  bindDisconnect();
  const serial = serialApi();
  if (!serial) return { status: "no-printer" };

  let port = rememberedPort;
  if (!port) {
    try {
      const ports = await serial.getPorts();
      port = ports[0] ?? null;
      rememberedPort = port;
    } catch {
      return { status: "no-printer" };
    }
  }
  if (!port) return { status: "need-permission" };
  if (!port.writable) return { status: "need-permission" };

  try {
    await ensurePortOpen(port);
    const writer = port.writable?.getWriter();
    if (!writer) return { status: "need-permission" };
    await writer.write(buildEscPosBytes(sale, profile));
    writer.releaseLock();
    return { status: "printed", method: "escpos" };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotFoundError" || name === "NotAllowedError") return { status: "need-permission" };
    rememberedPort = null;
    return { status: "no-printer" };
  }
}

export async function printCompletedSale(
  sale: PosCompletedSale,
  mode: "auto" | "system" | "escpos" | "bluetooth" = "auto",
  profile?: SupermarketReceiptDetails,
): Promise<PosPrintResult> {
  if (mode === "system") return printReceiptViaSystem(sale, profile);
  if (mode === "bluetooth") return printReceiptViaBluetooth(sale, profile);
  if (mode === "escpos") {
    const connected = await hasGrantedEscPosPrinter();
    if (!connected) return { status: "need-permission" };
    return printReceiptViaEscPos(sale, profile);
  }

  if (await hasGrantedEscPosPrinter()) {
    const direct = await printReceiptViaEscPos(sale, profile);
    if (direct.status === "printed") return direct;
    if (direct.status === "need-permission") return direct;
  }
  return printReceiptViaSystem(sale, profile);
}
