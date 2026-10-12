import { formatCompactDocumentNumber } from "@/lib/school/student-number";

export type SchoolReceiptLine = {
  label: string;
  amount: number;
  emphasize?: boolean;
};

export type SchoolReceiptChargeKind = "TUITION" | "TRANSPORT" | "STORE" | string;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function chunkToWords(value: number) {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    const ten = Math.floor(rest / 10);
    const one = rest % 10;
    if (ten) parts.push(one ? `${TENS[ten]}-${ONES[one]}` : TENS[ten]);
    else if (one) parts.push(ONES[one]);
  }
  return parts.join(" ");
}

export function tanzanianShillingsInWords(amount: number) {
  const value = Math.round(Math.abs(Number(amount) || 0));
  if (value === 0) return "Tanzanian Shillings Zero Only";
  const scales = [
    { n: 1_000_000_000, w: "Billion" },
    { n: 1_000_000, w: "Million" },
    { n: 1_000, w: "Thousand" },
  ] as const;
  const parts: string[] = [];
  let remaining = value;
  for (const scale of scales) {
    const count = Math.floor(remaining / scale.n);
    if (!count) continue;
    parts.push(`${chunkToWords(count)} ${scale.w}`);
    remaining %= scale.n;
  }
  if (remaining) parts.push(chunkToWords(remaining));
  return `Tanzanian Shillings ${parts.join(" ")} Only`;
}

export function formatSchoolReceiptNumber(paymentNumber: string) {
  const compact = formatCompactDocumentNumber(paymentNumber);
  const match = compact.match(/^([A-Za-z]+)-(\d+)$/);
  if (!match) return compact || "—";
  const prefix = match[1].toUpperCase();
  const digits = match[2].padStart(3, "0");
  if (prefix === "PAY" || prefix === "RCPT" || prefix === "FEE") return `RCPT-${digits}`;
  return `${prefix}-${digits}`;
}

export function formatReceiptDateTime(recordedAt: string, paymentDate = "") {
  const recorded = String(recordedAt ?? "").trim();
  const day = String(paymentDate ?? "").trim();
  const iso = recorded.includes("T") ? recorded : day ? `${day}T00:00:00` : "";
  if (!iso) return day;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return day || recorded;
  const withTime = recorded.includes("T");
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric" as const, minute: "2-digit" as const, hour12: true } : {}),
  }).format(date);
  return formatted.replace(/\b(am|pm)\b/gi, (part) => part.toUpperCase()).replace(",", ",");
}

export function receiptPaymentCategory(kind: SchoolReceiptChargeKind, storeCategory = "") {
  if (kind === "TRANSPORT") return "School Bus";
  if (kind === "STORE") return storeCategory === "UNIFORM" ? "Uniforms" : "School Store";
  return "School Fees";
}

export function receiptStatusLabel(status: string) {
  const next = String(status ?? "").trim().toLowerCase();
  if (next === "posted") return "PAID";
  if (next === "pending") return "PENDING";
  return next ? next.toUpperCase() : "PAID";
}

export function receiptClassLabel(levelName: string, className: string, streamName = "") {
  const parts = [levelName, className].map((value) => String(value ?? "").trim()).filter(Boolean);
  const joined = parts.join(" / ");
  const stream = String(streamName ?? "").trim();
  return stream ? `${joined}${joined ? " · " : ""}${stream}` : joined;
}

export function receiptContactLine(phone: string, email: string) {
  const parts = [
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
  ].filter(Boolean);
  return parts.join("  |  ");
}

export function receiptAddressLine(address: string, city: string) {
  return [address, city].map((value) => String(value ?? "").trim()).filter(Boolean).join(", ");
}

export function buildReceiptBreakdown(input: {
  chargeDescription: string;
  billed: number | null;
  previouslyPaid: number;
  thisPayment: number;
  outstanding: number | null;
}): SchoolReceiptLine[] {
  const description = String(input.chargeDescription ?? "").trim() || "Payment";
  const thisPayment = Number(input.thisPayment) || 0;
  if (input.billed == null) {
    return [
      { label: description, amount: thisPayment },
      { label: "This Payment", amount: thisPayment, emphasize: true },
    ];
  }
  return [
    { label: description, amount: input.billed },
    { label: "Previously Paid", amount: input.previouslyPaid },
    { label: "This Payment", amount: thisPayment, emphasize: true },
    { label: "Outstanding Balance", amount: input.outstanding ?? 0 },
  ];
}
