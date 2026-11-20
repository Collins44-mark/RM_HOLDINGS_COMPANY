import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  EMPTY_RECEIPT_DETAILS,
  RECEIPT_DETAIL_LIMITS,
  type SupermarketReceiptDetails,
} from "@/lib/supermarket/receipt-profile";

export const RECEIPT_STORE_MARKER = "__receipt_store__";

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function cleanReceiptDetails(input: Partial<SupermarketReceiptDetails> | null | undefined): SupermarketReceiptDetails {
  return {
    storeName: clip(input?.storeName, RECEIPT_DETAIL_LIMITS.storeName),
    location: clip(input?.location, RECEIPT_DETAIL_LIMITS.location),
    mobile: clip(input?.mobile, RECEIPT_DETAIL_LIMITS.mobile),
    tin: clip(input?.tin, RECEIPT_DETAIL_LIMITS.tin),
    email: clip(input?.email, RECEIPT_DETAIL_LIMITS.email),
    thanks: clip(input?.thanks, RECEIPT_DETAIL_LIMITS.thanks),
  };
}

export function receiptDetailsBlank(details: SupermarketReceiptDetails) {
  return !details.storeName && !details.location && !details.mobile && !details.tin && !details.email && !details.thanks;
}

function parseStoredName(name: string): SupermarketReceiptDetails {
  const trimmed = name.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<SupermarketReceiptDetails>;
      if (parsed && typeof parsed === "object") return cleanReceiptDetails(parsed);
    } catch {
      // Older rows stored the shop name as plain text.
    }
  }
  return { ...EMPTY_RECEIPT_DETAILS, storeName: clip(trimmed, RECEIPT_DETAIL_LIMITS.storeName) };
}

function missingColumn(message: string) {
  return /receipt_|column .* does not exist|schema cache/i.test(message);
}

async function supermarketUnitId(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const { data, error } = await admin.from("business_units").select("id").eq("code", "supermarket").maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function readMarker(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  unitId: string,
) {
  const { data, error } = await admin
    .from("sm_pos_customers")
    .select("name")
    .eq("business_unit_id", unitId)
    .eq("phone", RECEIPT_STORE_MARKER)
    .maybeSingle();
  if (error || typeof data?.name !== "string") return { ...EMPTY_RECEIPT_DETAILS };
  return parseStoredName(data.name);
}

async function writeMarker(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  unitId: string,
  details: SupermarketReceiptDetails,
) {
  const existing = await admin
    .from("sm_pos_customers")
    .select("id")
    .eq("business_unit_id", unitId)
    .eq("phone", RECEIPT_STORE_MARKER)
    .maybeSingle();
  if (existing.error) return { ok: false as const, error: "Could not save the receipt details." };
  if (receiptDetailsBlank(details)) {
    if (existing.data?.id) {
      const removed = await admin.from("sm_pos_customers").delete().eq("id", existing.data.id);
      if (removed.error) return { ok: false as const, error: "Could not save the receipt details." };
    }
    return { ok: true as const };
  }
  const name = JSON.stringify(details);
  if (existing.data?.id) {
    const updated = await admin.from("sm_pos_customers").update({ name }).eq("id", existing.data.id);
    if (updated.error) return { ok: false as const, error: "Could not save the receipt details." };
    return { ok: true as const };
  }
  const inserted = await admin.from("sm_pos_customers").insert({
    business_unit_id: unitId,
    name,
    phone: RECEIPT_STORE_MARKER,
  });
  if (inserted.error) return { ok: false as const, error: "Could not save the receipt details." };
  return { ok: true as const };
}

export async function getSupermarketReceiptDetails(): Promise<SupermarketReceiptDetails> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ...EMPTY_RECEIPT_DETAILS };
  const unitId = await supermarketUnitId(admin);
  if (!unitId) return { ...EMPTY_RECEIPT_DETAILS };

  const column = await admin
    .from("business_units")
    .select("receipt_store_name, receipt_location, receipt_mobile, receipt_tin, receipt_email, receipt_thanks")
    .eq("id", unitId)
    .maybeSingle();
  if (!column.error && column.data) {
    const fromColumns = cleanReceiptDetails({
      storeName: column.data.receipt_store_name,
      location: column.data.receipt_location,
      mobile: column.data.receipt_mobile,
      tin: column.data.receipt_tin,
      email: column.data.receipt_email,
      thanks: column.data.receipt_thanks,
    });
    if (!receiptDetailsBlank(fromColumns)) return fromColumns;
  }
  return readMarker(admin, unitId);
}

export async function getSupermarketStoreName() {
  const details = await getSupermarketReceiptDetails();
  return details.storeName;
}

export async function saveSupermarketReceiptDetails(input: Partial<SupermarketReceiptDetails>) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false as const, error: "Server is missing the database key." };
  const details = cleanReceiptDetails(input);
  const unitId = await supermarketUnitId(admin);
  if (!unitId) return { ok: false as const, error: "Supermarket business unit was not found." };

  const column = await admin
    .from("business_units")
    .update({
      receipt_store_name: details.storeName,
      receipt_location: details.location,
      receipt_mobile: details.mobile,
      receipt_tin: details.tin,
      receipt_email: details.email,
      receipt_thanks: details.thanks,
    })
    .eq("id", unitId);
  if (column.error && !missingColumn(column.error.message)) {
    return { ok: false as const, error: "Could not save the receipt details." };
  }

  const marked = await writeMarker(admin, unitId, details);
  if (!marked.ok) return marked;
  return { ok: true as const, details };
}
