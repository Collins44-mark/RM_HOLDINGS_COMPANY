import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type LinkedStaffInfo = {
  id: string;
  staffNumber: string;
  name: string;
  positionName: string;
  monthlySalary?: number | null;
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

export async function staffByProfileIds(
  admin: SupabaseClient,
  profileIds: string[],
  options: { includeSalary?: boolean } = {},
) {
  const map = new Map<string, LinkedStaffInfo>();
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await admin
    .from("sch_staff")
    .select("id, staff_number, first_name, middle_name, last_name, profile_id, job_title, monthly_salary, sch_staff_positions(name)")
    .in("profile_id", ids);
  if (error || !data) return map;
  for (const row of data) {
    const profileId = str(row.profile_id);
    if (!profileId) continue;
    const position = row.sch_staff_positions as { name?: string } | { name?: string }[] | null;
    const positionName =
      str((row as { job_title?: string }).job_title) ||
      (Array.isArray(position) ? str(position[0]?.name) : str(position?.name));
    const salaryRaw = options.includeSalary ? row.monthly_salary : undefined;
    const monthlySalary =
      salaryRaw == null || salaryRaw === "" ? null : Number.isFinite(Number(salaryRaw)) ? Number(salaryRaw) : null;
    map.set(profileId, {
      id: String(row.id),
      staffNumber: str(row.staff_number),
      name: personName(str(row.first_name), str(row.middle_name), str(row.last_name)),
      positionName,
      ...(options.includeSalary ? { monthlySalary } : {}),
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

async function allocateStaffNumber(admin: SupabaseClient, businessUnitId: string) {
  const rpc = await admin.rpc("sch_next_document_number", {
    p_business_unit_id: businessUnitId,
    p_doc_type: "staff",
    p_prefix: "STF",
  });
  if (!rpc.error && rpc.data) return String(rpc.data);

  const current = await admin
    .from("sch_document_counters")
    .select("next_value")
    .eq("business_unit_id", businessUnitId)
    .eq("doc_type", "staff")
    .maybeSingle();
  if (current.error) return null;

  if (!current.data) {
    const inserted = await admin
      .from("sch_document_counters")
      .insert({
        business_unit_id: businessUnitId,
        doc_type: "staff",
        prefix: "STF",
        next_value: 2,
      })
      .select("next_value")
      .maybeSingle();
    if (inserted.data?.next_value != null) {
      return `STF-${String(Number(inserted.data.next_value) - 1).padStart(6, "0")}`;
    }
    if (inserted.error?.code !== "23505") return null;
  }

  const latest = await admin
    .from("sch_document_counters")
    .select("next_value")
    .eq("business_unit_id", businessUnitId)
    .eq("doc_type", "staff")
    .maybeSingle();
  const n = Number(latest.data?.next_value);
  if (!Number.isFinite(n) || n < 1) return null;
  const updated = await admin
    .from("sch_document_counters")
    .update({ next_value: n + 1 })
    .eq("business_unit_id", businessUnitId)
    .eq("doc_type", "staff")
    .eq("next_value", n)
    .select("next_value")
    .maybeSingle();
  const issued = updated.data?.next_value != null ? Number(updated.data.next_value) - 1 : n;
  return `STF-${String(issued).padStart(6, "0")}`;
}

export async function insertStaffForProfile(
  admin: SupabaseClient,
  input: {
    profileId: string;
    fullName: string;
    phone: string;
    email: string;
    staffTypeId?: string;
    staffPositionId?: string;
    jobTitle?: string;
    roleId?: string;
  },
): Promise<{ error: string } | { staff: LinkedStaffInfo; businessUnitId: string }> {
  const businessUnitId = await schoolBusinessUnitId(admin);
  if (!businessUnitId) return { error: "School business unit was not found." };

  const already = await admin
    .from("sch_staff")
    .select("id, staff_number, first_name, middle_name, last_name, job_title, sch_staff_positions(name)")
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (already.data) {
    const position = already.data.sch_staff_positions as { name?: string } | { name?: string }[] | null;
    const positionName =
      str(already.data.job_title) || (Array.isArray(position) ? str(position[0]?.name) : str(position?.name));
    return {
      staff: {
        id: String(already.data.id),
        staffNumber: str(already.data.staff_number),
        name: personName(str(already.data.first_name), str(already.data.middle_name), str(already.data.last_name)),
        positionName,
      } satisfies LinkedStaffInfo,
      businessUnitId,
    };
  }

  const staffTypeId = str(input.staffTypeId);
  const staffPositionId = str(input.staffPositionId);
  let positionName = str(input.jobTitle);
  if (staffPositionId) {
    const position = await admin
      .from("sch_staff_positions")
      .select("id, staff_type_id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffPositionId)
      .maybeSingle();
    if (!position.data) return { error: "Choose a valid position." };
    if (staffTypeId && String(position.data.staff_type_id) !== staffTypeId) {
      return { error: "The selected position does not belong to that staff type." };
    }
    positionName = positionName || str(position.data.name);
  } else if (staffTypeId) {
    const type = await admin
      .from("sch_staff_types")
      .select("id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffTypeId)
      .maybeSingle();
    if (!type.data) return { error: "Choose a valid staff type." };
  }

  const number = await allocateStaffNumber(admin, businessUnitId);
  if (!number) return { error: "Couldn't allocate a staff number." };

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
      staff_type_id: staffTypeId || null,
      position_id: staffPositionId || null,
      job_title: str(input.jobTitle).slice(0, 80),
      ...(str(input.roleId) ? { role_id: str(input.roleId) } : {}),
      employment_status: "active",
      profile_id: input.profileId,
    })
    .select("id, staff_number, first_name, middle_name, last_name, sch_staff_positions(name)")
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      const linked = await admin
        .from("sch_staff")
        .select("id, staff_number, first_name, middle_name, last_name, job_title, sch_staff_positions(name)")
        .eq("profile_id", input.profileId)
        .maybeSingle();
      if (linked.data) {
        const position = linked.data.sch_staff_positions as { name?: string } | { name?: string }[] | null;
        return {
          staff: {
            id: String(linked.data.id),
            staffNumber: str(linked.data.staff_number),
            name: personName(str(linked.data.first_name), str(linked.data.middle_name), str(linked.data.last_name)),
            positionName:
              str(linked.data.job_title) || (Array.isArray(position) ? str(position[0]?.name) : str(position?.name)),
          } satisfies LinkedStaffInfo,
          businessUnitId,
        };
      }
      return { error: "That account is already linked to a staff member." };
    }
    return { error: "Unable to create the staff profile." };
  }
  const positionRow = inserted.data.sch_staff_positions as { name?: string } | { name?: string }[] | null;
  const insertedPosition = str(input.jobTitle) || (Array.isArray(positionRow) ? str(positionRow[0]?.name) : str(positionRow?.name)) || positionName;
  return {
    staff: {
      id: String(inserted.data.id),
      staffNumber: str(inserted.data.staff_number),
      name: personName(str(inserted.data.first_name), str(inserted.data.middle_name), str(inserted.data.last_name)),
      positionName: insertedPosition,
    } satisfies LinkedStaffInfo,
    businessUnitId,
  };
}

async function academicStaffTypeId(admin: SupabaseClient, businessUnitId: string) {
  const existing = await admin
    .from("sch_staff_types")
    .select("id")
    .eq("business_unit_id", businessUnitId)
    .eq("kind", "academic")
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();
  if (existing.data?.id) return String(existing.data.id);
  const inserted = await admin
    .from("sch_staff_types")
    .insert({
      business_unit_id: businessUnitId,
      name: "Academic",
      code: "ACADEMIC",
      kind: "academic",
      is_active: true,
    })
    .select("id")
    .maybeSingle();
  if (inserted.data?.id) return String(inserted.data.id);
  const again = await admin
    .from("sch_staff_types")
    .select("id")
    .eq("business_unit_id", businessUnitId)
    .eq("kind", "academic")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return again.data?.id ? String(again.data.id) : undefined;
}

export async function ensureTeacherStaffForProfile(
  admin: SupabaseClient,
  input: { profileId: string; fullName: string; phone?: string; email?: string; roleId?: string },
) {
  const { data, error } = await admin.rpc("sch_ensure_teacher_staff", { p_profile_id: input.profileId });
  if (error) {
    const missing = /could not find|does not exist|schema cache/i.test(error.message ?? "");
    if (!missing) return { error: error.message || "Unable to link the teacher to School Staff." };
    const businessUnitId = await schoolBusinessUnitId(admin);
    const staffTypeId = businessUnitId ? await academicStaffTypeId(admin, businessUnitId) : undefined;
    return insertStaffForProfile(admin, {
      profileId: input.profileId,
      fullName: input.fullName,
      phone: input.phone ?? "",
      email: input.email ?? "",
      jobTitle: "Teacher",
      roleId: input.roleId,
      staffTypeId,
    });
  }
  const payload = (data ?? {}) as { ok?: boolean; id?: string; staff_number?: string; reason?: string; created?: boolean };
  if (!payload.ok) return { skipped: true as const, reason: String(payload.reason ?? "") };
  const linked = await admin
    .from("sch_staff")
    .select("id, staff_number, first_name, middle_name, last_name, job_title, sch_staff_positions(name)")
    .eq("id", String(payload.id ?? ""))
    .maybeSingle();
  if (!linked.data) {
    return {
      staff: {
        id: String(payload.id ?? ""),
        staffNumber: str(payload.staff_number),
        name: "",
        positionName: "Teacher",
      } satisfies LinkedStaffInfo,
      created: Boolean(payload.created),
    };
  }
  const position = linked.data.sch_staff_positions as { name?: string } | { name?: string }[] | null;
  const businessUnitId = await schoolBusinessUnitId(admin);
  return {
    staff: {
      id: String(linked.data.id),
      staffNumber: str(linked.data.staff_number),
      name: personName(str(linked.data.first_name), str(linked.data.middle_name), str(linked.data.last_name)),
      positionName: str(linked.data.job_title) || (Array.isArray(position) ? str(position[0]?.name) : str(position?.name)),
    } satisfies LinkedStaffInfo,
    created: Boolean(payload.created),
    businessUnitId: businessUnitId ?? "",
  };
}
