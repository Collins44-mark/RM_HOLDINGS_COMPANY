import { APP_NAME, APP_TIMEZONE } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { type PosCompletedSale } from "@/lib/data/sample-supermarket-pos";

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
  | { status: "printed"; method: "system" | "escpos" }
  | { status: "need-permission" }
  | { status: "no-printer" }
  | { status: "cancelled" };

let rememberedPort: SerialPortLike | null = null;
let disconnectBound = false;

function serialApi(): SerialApi | null {
  if (typeof navigator === "undefined") return null;
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  return serial ?? null;
}

export function isEscPosSupported() {
  return serialApi() !== null;
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
  return port;
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

function paymentLines(sale: PosCompletedSale) {
  const lines: { label: string; value: string }[] = [{ label: "Payment", value: asText(sale.payment) }];
  if (sale.payment === "Mobile Money") {
    lines.push({ label: "Provider", value: asText(sale.mobileProvider) });
  }
  if (sale.payment === "Card") {
    lines.push({ label: "Card Amount", value: formatTzs(asAmount(sale.cardAmount ?? sale.totalDue)) });
  }
  if (sale.payment === "Mixed") {
    lines.push({ label: "Cash", value: formatTzs(asAmount(sale.mixedCash)) });
    lines.push({
      label: sale.mobileProvider ? `Mobile Money (${sale.mobileProvider})` : "Mobile Money",
      value: formatTzs(asAmount(sale.mixedMobile)),
    });
  }
  if (sale.payment === "Cash") {
    lines.push({ label: "Cash Received", value: formatTzs(asAmount(sale.cashReceived)) });
    lines.push({ label: "Change", value: formatTzs(asAmount(sale.change)) });
  }
  return lines;
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

export function buildPosReceiptHtml(sale: PosCompletedSale) {
  const items = itemRows(sale);
  const itemMarkup = items
    .map(
      (item) => `<div class="item">
        <p class="item-name">${escapeHtml(item.name)}</p>
        <p class="item-line"><span>${item.quantity} × ${escapeHtml(formatTzs(item.unitPrice))}</span><span>${escapeHtml(formatTzs(item.lineTotal))}</span></p>
      </div>`,
    )
    .join("");

  const extraPaymentMarkup = paymentLines(sale)
    .filter((line) => line.label !== "Payment")
    .map(
      (line) =>
        `<p><span class="label">${escapeHtml(line.label)}:</span>${escapeHtml(line.value)}</p>`,
    )
    .join("");

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
        background: #fff;
        color: #111;
      }
      body {
        font-family: "Courier New", Courier, ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.35;
        width: 72mm;
        max-width: 100%;
      }
      .receipt {
        width: 72mm;
        max-width: 100%;
        box-sizing: border-box;
        padding: 2mm 1.5mm 8mm;
        color: #111;
        background: #fff;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-align: center;
        text-transform: uppercase;
      }
      .meta { margin: 0 0 8px; }
      .meta p { margin: 0 0 7px; }
      .label {
        display: block;
        font-size: 11px;
        font-weight: 700;
      }
      .rule {
        margin: 8px 0;
        border: 0;
        border-top: 1px dashed #111;
      }
      .head {
        margin: 0 0 6px;
        font-weight: 700;
      }
      .cols {
        display: flex;
        justify-content: space-between;
        margin: 0 0 8px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .item { margin: 0 0 8px; }
      .item-name { margin: 0; font-weight: 700; }
      .item-line, .row, .cols {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .item-line, .row { margin: 2px 0 0; }
      .totals .row { margin: 3px 0 0; }
      .total {
        margin-top: 6px;
        font-weight: 700;
        font-size: 13px;
      }
      .thanks {
        margin: 10px 0 0;
        text-align: center;
      }
      .thanks p { margin: 0 0 6px; }
      @media print {
        html, body {
          background: #fff !important;
          color: #000 !important;
          width: auto;
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
      <h1>${escapeHtml(APP_NAME)}</h1>
      <div class="meta">
        <p><span class="label">Store:</span>${escapeHtml(asText(sale.store))}</p>
        <p><span class="label">Invoice:</span>${escapeHtml(invoiceLabel(sale))}</p>
        <p><span class="label">Date &amp; Time:</span>${escapeHtml(formatReceiptStamp(sale.soldAt))}</p>
        <p><span class="label">Cashier:</span>${escapeHtml(asText(sale.cashier))}</p>
        <p><span class="label">Customer:</span>${escapeHtml(asText(sale.customer))}</p>
      </div>
      <hr class="rule" />
      <p class="head">ITEM</p>
      <p class="cols"><span>QTY&nbsp;&nbsp;&nbsp;PRICE</span><span>TOTAL</span></p>
      ${itemMarkup}
      <hr class="rule" />
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${escapeHtml(formatTzs(asAmount(sale.subtotal)))}</span></div>
        <div class="row"><span>Discount</span><span>${escapeHtml(formatTzs(asAmount(sale.discount)))}</span></div>
        <div class="row"><span>VAT</span><span>${escapeHtml(formatTzs(asAmount(sale.tax)))}</span></div>
      </div>
      <hr class="rule" />
      <div class="row total"><span>TOTAL DUE</span><span>${escapeHtml(formatTzs(asAmount(sale.totalDue)))}</span></div>
      <div class="meta" style="margin-top:8px">
        <p><span class="label">Payment:</span>${escapeHtml(asText(sale.payment))}</p>
        ${extraPaymentMarkup}
      </div>
      <hr class="rule" />
      <div class="thanks">
        <p>Thank you for shopping with us.</p>
        <p>${escapeHtml(APP_NAME)}</p>
      </div>
    </article>
  </body>
</html>`;
}

export async function printReceiptViaSystem(sale: PosCompletedSale): Promise<PosPrintResult> {
  if (typeof document === "undefined") return { status: "no-printer" };
  const html = buildPosReceiptHtml(sale);
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

function wrapLine(value: string, width = RECEIPT_COLS) {
  const text = value.trim();
  if (!text) return [""];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    lines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  lines.push(remaining);
  return lines;
}

function centerLine(value: string, width = RECEIPT_COLS) {
  const text = value.slice(0, width);
  const space = Math.max(0, width - text.length);
  const left = Math.floor(space / 2);
  return `${" ".repeat(left)}${text}`;
}

function rule() {
  return "-".repeat(RECEIPT_COLS);
}

export function buildEscPosBytes(sale: PosCompletedSale) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const chunks: number[] = [ESC, 0x40, ESC, 0x61, 0x00];
  const write = (line = "") => {
    chunks.push(...encodeAscii(line), 0x0a);
  };

  write(centerLine(APP_NAME.toUpperCase()));
  write();
  write("Store:");
  write(asText(sale.store));
  write();
  write("Invoice:");
  write(invoiceLabel(sale));
  write();
  write("Date & Time:");
  write(formatReceiptStamp(sale.soldAt));
  write();
  write("Cashier:");
  write(asText(sale.cashier));
  write();
  write("Customer:");
  write(asText(sale.customer));
  write(rule());
  write("ITEM");
  write(padRow("QTY    PRICE", "TOTAL"));
  write();
  for (const item of itemRows(sale)) {
    for (const line of wrapLine(item.name)) write(line);
    write(padRow(`${item.quantity} x ${formatTzs(item.unitPrice)}`, formatTzs(item.lineTotal)));
    write();
  }
  write(rule());
  write(padRow("Subtotal", formatTzs(asAmount(sale.subtotal))));
  write(padRow("Discount", formatTzs(asAmount(sale.discount))));
  write(padRow("VAT", formatTzs(asAmount(sale.tax))));
  write(rule());
  write(padRow("TOTAL DUE", formatTzs(asAmount(sale.totalDue))));
  write();
  write("Payment:");
  write(asText(sale.payment));
  if (sale.payment === "Cash") {
    write();
    write("Cash Received:");
    write(formatTzs(asAmount(sale.cashReceived)));
    write();
    write("Change:");
    write(formatTzs(asAmount(sale.change)));
  } else {
    for (const line of paymentLines(sale).filter((row) => row.label !== "Payment")) {
      write();
      write(`${line.label}:`);
      write(line.value);
    }
  }
  write(rule());
  write();
  write(centerLine("Thank you for shopping"));
  write(centerLine("with us."));
  write();
  write(centerLine(APP_NAME));
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

export async function printReceiptViaEscPos(sale: PosCompletedSale): Promise<PosPrintResult> {
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
    await writer.write(buildEscPosBytes(sale));
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
  mode: "auto" | "system" | "escpos" = "auto",
): Promise<PosPrintResult> {
  if (mode === "system") return printReceiptViaSystem(sale);
  if (mode === "escpos") {
    const connected = await hasGrantedEscPosPrinter();
    if (!connected) return { status: "need-permission" };
    return printReceiptViaEscPos(sale);
  }

  if (await hasGrantedEscPosPrinter()) {
    const direct = await printReceiptViaEscPos(sale);
    if (direct.status === "printed") return direct;
    if (direct.status === "need-permission") return direct;
  }
  return printReceiptViaSystem(sale);
}
