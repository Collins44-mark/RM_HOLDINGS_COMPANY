import { NextResponse } from "next/server";
import { identityFromUser } from "@/lib/auth/types";
import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditEvent } from "@/lib/audit";
import { denyLivestock, resolveLivestockUnit } from "@/lib/livestock/access";
import { runLivestockAction } from "@/lib/livestock/actions";
import { loadLivestockDirectory } from "@/lib/livestock/directory";
import { scopeLivestockDirectory } from "@/lib/livestock/scope";

const permissions: Record<string, string[]> = {
  type: ["livestock.types.manage"],
  opening: ["livestock.records.create"],
  purchase: ["livestock.purchases.manage"],
  "purchase-cancel": ["livestock.purchases.manage"],
  pregnancy: ["livestock.pregnancy.manage"],
  "pregnancy-cancel": ["livestock.pregnancy.manage"],
  birth: ["livestock.births.manage"],
  "birth-cancel": ["livestock.births.manage"],
  death: ["livestock.movements.manage", "livestock.deaths.create"],
  adjustment: ["livestock.movements.manage"],
  composition: ["livestock.records.edit"],
  sale: ["livestock.sales.manage"],
  "sale-payment": ["livestock.sales.manage"],
  "sale-cancel": ["livestock.sales.manage"],
  house: ["livestock.houses.manage"],
  "house-update": ["livestock.houses.manage"],
  "rental-start": ["livestock.rentals.manage"],
  "rental-end": ["livestock.rentals.manage"],
  eggs: ["livestock.houses.manage"],
  "egg-sale": ["livestock.sales.manage"],
  "egg-sale-pay": ["livestock.sales.manage"],
  "egg-sale-cancel": ["livestock.sales.manage"],
  "egg-rule": ["livestock.houses.manage"],
  "rental-payment": ["livestock.rental_payments.record"],
  expense: ["livestock.expenses.manage"],
  "expense-payment": ["livestock.expense_payments.record"],
  "expense-cancel": ["livestock.expenses.manage"],
};

export async function GET() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  const denied = denyLivestock(user, ["livestock.dashboard.view", "livestock.records.view", "livestock.animals.view", "livestock.houses.manage", "livestock.rentals.manage", "livestock.expenses.manage", "livestock.sales.manage", "livestock.purchases.manage", "livestock.reports.view"]);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const resolved = await resolveLivestockUnit(user, admin);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  return NextResponse.json(scopeLivestockDirectory(await loadLivestockDirectory(admin, resolved.buId), identityFromUser(user)));
}

export async function POST(request: Request) {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const allowed = permissions[action];
  if (!allowed) return NextResponse.json({ error: "Unknown livestock action" }, { status: 400 });
  const denied = denyLivestock(user, allowed);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const resolved = await resolveLivestockUnit(user, admin);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (body.animal_type_id) {
    const type = await admin.from("ls_animal_types").select("id").eq("id", body.animal_type_id).eq("business_unit_id", resolved.buId).maybeSingle();
    if (!type.data) return NextResponse.json({ error: "Select an animal type from this farm" }, { status: 400 });
  }
  const result = await runLivestockAction(admin, resolved.buId, user.id, body);
  if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  await writeAuditEvent({
    action: `livestock.${action}`,
    module: "livestock",
    description: auditText(action, body),
    severity: action.includes("cancel") ? "high" : "medium",
    entityType: action,
    entityId: "id" in result ? result.id : null,
    businessUnitId: resolved.buId,
    metadata: { animal_type_id: body.animal_type_id || null, quantity: body.quantity || body.mothers || null },
  });
  const directory = scopeLivestockDirectory(await loadLivestockDirectory(admin, resolved.buId), identityFromUser(user));
  return NextResponse.json({ ...result, directory });
}

function auditText(action: string, body: any) {
  const labels: Record<string, string> = {
    type: `Added animal type ${body.name || ""}`.trim(),
    opening: "Recorded opening livestock stock.",
    purchase: "Recorded a livestock purchase.",
    "purchase-cancel": "Cancelled a livestock purchase.",
    pregnancy: "Recorded a pregnancy.",
    "pregnancy-cancel": "Cancelled a pregnancy record.",
    birth: "Recorded a birth.",
    "birth-cancel": "Cancelled a birth.",
    death: "Recorded an animal death.",
    adjustment: "Recorded a stock adjustment.",
    composition: "Updated livestock males, females, adults, young, and weight.",
    sale: "Recorded a livestock sale.",
    "sale-payment": "Recorded a livestock sale payment.",
    "sale-cancel": "Cancelled a livestock sale.",
    house: "Created a poultry house.",
    "house-update": "Updated a poultry house.",
    "rental-start": "Started a poultry house rental.",
    "rental-end": "Ended a poultry house rental.",
    eggs: "Recorded eggs collected from chickens.",
    "egg-sale": "Recorded an egg sale.",
    "egg-sale-pay": "Recorded an egg sale payment.",
    "egg-sale-cancel": "Cancelled an egg sale.",
    "egg-rule": "Updated how many eggs fill one tray.",
    "rental-payment": "Recorded a poultry rental payment.",
    expense: "Recorded a livestock expense.",
    "expense-payment": "Recorded a livestock expense payment.",
    "expense-cancel": "Cancelled a livestock expense.",
  };
  return labels[action] || "Updated livestock records.";
}
