import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type LinkedStaffInfo = {
  id: string;
  staffNumber: string;
  name: string;
  positionName: string;
};

export type StaffLinkUserOption = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type StaffLinkStaffOption = {
  id: string;
  staffNumber: string;
  name: string;
  positionName: string;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function personName(first: string, middle: string, last: string) {
  return [first, middle, last].filter(Boolean).join(" ");
}

export function splitFullName(fullName: string) {
  const parts = str(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Staff", middleName: "", lastName: "Member" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

export async function schoolBusinessUnitId(admin: SupabaseClient) {
  const { data, error } = await admin.from("business_units").select("id").eq("code", "school").maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}

export function adminOrNull() {
  return createSupabaseAdminClient();
}

export async function staffByProfileIds(admin: SupabaseClient, profileIds: string[]) {
  const map = new Map<string, LinkedStaffInfo>();
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await admin
    .from("sch_staff")
    .select("id, staff_number, first_name, middle_name, last_name, profile_id, sch_staff_positions(name)")
    .in("profile_id", ids);
  if (error || !data) return map;
  for (const row of data) {
    const profileId = str(row.profile_id);
    if (!profileId) continue;
    const position = row.sch_staff_positions as { name?: string } | { name?: string }[] | null;
    const positionName = Array.isArray(position) ? str(position[0]?.name) : str(position?.name);
    map.set(profileId, {
      id: String(row.id),
      staffNumber: str(row.staff_number),
      name: personName(str(row.first_name), str(row.middle_name), str(row.last_name)),
      positionName,
    });
  }
  return map;
}

export async function linkedProfileIds(admin: SupabaseClient) {
  const { data, error } = await admin.from("sch_staff").select("profile_id").not("profile_id", "is", null);
  if (error || !data) return new Set<string>();
  return new Set(data.map((row) => str(row.profile_id)).filter(Boolean));
}

export async function setStaffProfileId(
  admin: SupabaseClient,
  input: { staffId: string; profileId: string | null; businessUnitId: string },
): Promise<{ error: string } | { staff: LinkedStaffInfo }> {
  if (input.profileId) {
    const existing = await admin.from("sch_staff").select("id").eq("profile_id", input.profileId).maybeSingle();
    if (existing.data && String(existing.data.id) !== input.staffId) {
      return { error: "That account is already linked to another staff member." };
    }
  }
  const updated = await admin
    .from("sch_staff")
    .update({ profile_id: input.profileId, updated_at: new Date().toISOString() })
    .eq("id", input.staffId)
    .eq("business_unit_id", input.businessUnitId)
    .select("id, staff_number, first_name, middle_name, last_name, profile_id, sch_staff_positions(name)")
    .maybeSingle();
  if (updated.error) {
    if (updated.error.code === "23505") {
      return { error: "That account is already linked to a staff member." };
    }
    return { error: "Unable to update the staff account link." };
  }
  if (!updated.data) return { error: "Staff member was not found." };
  const position = updated.data.sch_staff_positions as { name?: string } | { name?: string }[] | null;
  const positionName = Array.isArray(position) ? str(position[0]?.name) : str(position?.name);
  return {
    staff: {
      id: String(updated.data.id),
      staffNumber: str(updated.data.staff_number),
      name: personName(str(updated.data.first_name), str(updated.data.middle_name), str(updated.data.last_name)),
      positionName,
    } satisfies LinkedStaffInfo,
  };
}

export async function insertStaffForProfile(
  admin: SupabaseClient,
  input: {
    profileId: string;
    fullName: string;
    phone: string;
    email: string;
    staffTypeId: string;
    staffPositionId: string;
    roleId?: string;
  },
): Promise<{ error: string } | { staff: LinkedStaffInfo; businessUnitId: string }> {
  const businessUnitId = await schoolBusinessUnitId(admin);
  if (!businessUnitId) return { error: "School business unit was not found." };

  const already = await admin.from("sch_staff").select("id, staff_number").eq("profile_id", input.profileId).maybeSingle();
  if (already.data) {
    return { error: `This account is already linked to ${str(already.data.staff_number)}.` };
  }

  const position = await admin
    .from("sch_staff_positions")
    .select("id, staff_type_id")
    .eq("business_unit_id", businessUnitId)
    .eq("id", input.staffPositionId)
    .maybeSingle();
  if (!position.data || String(position.data.staff_type_id) !== input.staffTypeId) {
    return { error: "Choose a valid staff type and position." };
  }

  const { data: number, error: numError } = await admin.rpc("sch_next_document_number", {
    p_business_unit_id: businessUnitId,
    p_doc_type: "staff",
    p_prefix: "STF",
  });
  if (numError || !number) return { error: "Couldn't allocate a staff number." };

  const names = splitFullName(input.fullName);
  const inserted = await admin
    .from("sch_staff")
    .insert({
      business_unit_id: businessUnitId,
      staff_number: String(number),
      first_name: names.firstName.slice(0, 80),
      middle_name: names.middleName.slice(0, 80),
      last_name: names.lastName.slice(0, 80),
      phone: str(input.phone).slice(0, 40),
      email: str(input.email).slice(0, 160),
      staff_type_id: input.staffTypeId,
      position_id: input.staffPositionId,
      ...(str(input.roleId) ? { role_id: str(input.roleId) } : {}),
      employment_status: "active",
      profile_id: input.profileId,
    })
    .select("id, staff_number, first_name, middle_name, last_name, sch_staff_positions(name)")
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      return { error: "That account is already linked to a staff member." };
    }
    return { error: "Unable to create the staff profile." };
  }
  const positionRow = inserted.data.sch_staff_positions as { name?: string } | { name?: string }[] | null;
  const positionName = Array.isArray(positionRow) ? str(positionRow[0]?.name) : str(positionRow?.name);
  return {
    staff: {
      id: String(inserted.data.id),
      staffNumber: str(inserted.data.staff_number),
      name: personName(str(inserted.data.first_name), str(inserted.data.middle_name), str(inserted.data.last_name)),
      positionName,
    } satisfies LinkedStaffInfo,
    businessUnitId,
  };
}
