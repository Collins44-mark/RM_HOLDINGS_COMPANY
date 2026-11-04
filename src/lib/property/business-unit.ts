export async function resolveBusinessUnitId(user: any, admin: any) {
  const roleCode = user?.roleCode || "";
  const isOwner = roleCode === "OWNER" || roleCode === "SUPER_ADMIN";
  if (!isOwner && !user?.businessUnits?.length) {
    return { error: "Not authorized for property operations", status: 403 as const };
  }
  let buId = "";
  const assigned = user?.businessUnits || [];
  const propertyUnit = assigned.find((unit: { code?: string; id?: string }) => unit?.code === "property") || (assigned.length === 1 ? assigned[0] : null);
  if (propertyUnit?.id && (propertyUnit.code === "property" || assigned.length === 1)) buId = String(propertyUnit.id);
  else if (propertyUnit?.code) {
    const { data: buRow } = await admin.from("business_units").select("id").eq("code", propertyUnit.code).limit(1).maybeSingle();
    buId = buRow?.id ? String(buRow.id) : "";
  }
  if (!buId && (isOwner || user?.modules?.includes("*") || assigned.some((unit: { code?: string }) => unit?.code === "property"))) {
    const { data: property } = await admin.from("business_units").select("id").eq("code", "property").maybeSingle();
    if (property?.id) buId = String(property.id);
  }
  if (!buId) return { error: "Missing business_unit_id — no authorized business unit assigned to user", status: 401 as const };
  return { buId };
}
