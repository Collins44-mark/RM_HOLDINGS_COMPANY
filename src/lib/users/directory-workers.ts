import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEmail } from "@/lib/auth/identifiers";
import type { ManagedUser } from "@/lib/data/app-users";

export type DirectoryWorkerSource = "school" | "farm";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function personName(first: string, middle: string, last: string) {
  return [first, middle, last].map(text).filter(Boolean).join(" ");
}

function digits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const a = digits(left);
  const b = digits(right);
  if (a.length < 9 || b.length < 9) return false;
  return a.slice(-9) === b.slice(-9);
}

function farmRoleLabel(role: string) {
  if (role === "OPERATOR") return "Operator";
  if (role === "MECHANIC") return "Mechanic";
  return "Worker";
}

function workerUser(input: {
  source: DirectoryWorkerSource;
  recordId: string;
  name: string;
  phone: string;
  email: string;
  position: string;
  staffNumber: string;
  moduleCode: string;
  moduleName: string;
  createdAt: string;
  monthlySalary: number | null;
}): ManagedUser {
  return {
    id: `worker:${input.source}:${input.recordId}`,
    name: input.name || "Worker",
    email: input.email || null,
    phone: input.phone || null,
    loginIdentifier: input.phone || input.email || "No account",
    roleCode: "WORKER",
    roleName: "Worker",
    modules: [],
    moduleNames: [],
    isActive: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedAt: null,
    lastLoginAt: null,
    createdAt: input.createdAt,
    status: "no_access",
    staff: {
      id: input.recordId,
      staffNumber: input.staffNumber,
      name: input.name,
      positionName: input.position,
      monthlySalary: input.monthlySalary,
    },
    worker: {
      source: input.source,
      recordId: input.recordId,
      moduleCode: input.moduleCode,
      moduleName: input.moduleName,
    },
  };
}

function claimed(users: ManagedUser[], name: string, phone: string) {
  const normalized = name.trim().toLowerCase();
  return users.some((user) => {
    if (user.status === "no_access") return false;
    if (samePhone(user.phone, phone)) return true;
    return !digits(phone) && normalized.length > 1 && user.name.trim().toLowerCase() === normalized;
  });
}

async function schoolWorkers(client: SupabaseClient, users: ManagedUser[]) {
  const { data, error } = await client
    .from("sch_staff")
    .select("id, staff_number, first_name, middle_name, last_name, phone, email, profile_id, job_title, monthly_salary, employment_status, created_at, sch_staff_positions(name)")
    .is("profile_id", null);
  if (error || !data) return [];
  return data.flatMap((row) => {
    if (text(row.employment_status) === "inactive") return [];
    const name = personName(text(row.first_name), text(row.middle_name), text(row.last_name));
    const phone = text(row.phone);
    if (claimed(users, name, phone)) return [];
    const position = row.sch_staff_positions as { name?: string } | { name?: string }[] | null;
    const positionName = text(row.job_title) || (Array.isArray(position) ? text(position[0]?.name) : text(position?.name)) || "Staff";
    const salary = row.monthly_salary == null || row.monthly_salary === "" ? null : Number(row.monthly_salary);
    return [
      workerUser({
        source: "school",
        recordId: String(row.id),
        name,
        phone,
        email: publicEmail(text(row.email)),
        position: positionName,
        staffNumber: text(row.staff_number),
        moduleCode: "school",
        moduleName: "School",
        createdAt: text(row.created_at) || new Date().toISOString(),
        monthlySalary: salary != null && Number.isFinite(salary) ? salary : null,
      }),
    ];
  });
}

async function farmWorkers(client: SupabaseClient, users: ManagedUser[]) {
  const withProfile = await client
    .from("farm_staff")
    .select("id, staff_number, name, phone, role, is_active, created_at, profile_id")
    .eq("is_active", true);
  const query = withProfile.error ? await client.from("farm_staff").select("id, staff_number, name, phone, role, is_active, created_at").eq("is_active", true) : withProfile;
  if (query.error || !query.data) return [];
  return query.data.flatMap((row) => {
    const profileId = text((row as { profile_id?: string }).profile_id);
    if (profileId && users.some((user) => user.id === profileId)) return [];
    const name = text(row.name);
    const phone = text(row.phone);
    if (claimed(users, name, phone)) return [];
    return [
      workerUser({
        source: "farm",
        recordId: String(row.id),
        name,
        phone,
        email: "",
        position: farmRoleLabel(text(row.role)),
        staffNumber: text(row.staff_number),
        moduleCode: "farm",
        moduleName: "Farm & Tractor Services",
        createdAt: text(row.created_at) || new Date().toISOString(),
        monthlySalary: null,
      }),
    ];
  });
}

/** Staff recorded in a module who do not yet have a login. */
export async function listDirectoryWorkers(client: SupabaseClient, users: ManagedUser[]) {
  const [school, farm] = await Promise.all([schoolWorkers(client, users), farmWorkers(client, users)]);
  return [...school, ...farm];
}
