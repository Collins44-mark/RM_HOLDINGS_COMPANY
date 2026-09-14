"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireVerifiedOwner } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import {
  ALL_MODULES_VALUE,
  isRoleAllowedForModules,
  modulesForAssignment,
  roleDefinition,
} from "@/lib/auth/role-options";
import { generateTemporaryPassword } from "@/lib/auth/temp-password";
import {
  displayLoginIdentifier,
  normalizeEmail,
  normalizePhone,
  syntheticEmailForPhone,
} from "@/lib/auth/identifiers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getAccessCatalog,
  listManagedUsers,
  statusOf,
  type ManagedUser,
} from "@/lib/data/app-users";

export type CredentialsPayload = {
  name: string;
  loginIdentifier: string;
  temporaryPassword: string;
  modules: string[];
  roleName: string;
};

export type UsersActionState = {
  error?: string;
  credentials?: CredentialsPayload;
  createdUser?: ManagedUser;
} | null;

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  roleCode: z.string().min(1),
  modules: z.array(z.string()).min(1),
});

function adminOrError() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  return { ok: true as const, admin };
}

async function ownerCount(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const users = await listManagedUsers();
  return users.filter((user) => isOwnerRole(user.roleCode) && user.isActive).length;
}

function parseModules(formData: FormData) {
  const values = formData.getAll("modules").map(String).filter(Boolean);
  if (values.includes(ALL_MODULES_VALUE)) return [ALL_MODULES_VALUE];
  return [...new Set(values)];
}

async function setUserAccess(input: {
  userId: string;
  roleCode: string;
  moduleCodes: string[];
  name?: string;
  email?: string | null;
  phone?: string | null;
  mustChangePassword?: boolean;
  isActive?: boolean;
  failedLoginAttempts?: number;
  lockedAt?: string | null;
}) {
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  const { admin } = ready;

  const assignedCodes = modulesForAssignment(input.moduleCodes);
  const [roleResult, unitsResult] = await Promise.all([
    admin.from("roles").select("id, name, code").eq("code", input.roleCode).maybeSingle(),
    assignedCodes.length
      ? admin.from("business_units").select("id, code, name").in("code", assignedCodes)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
  ]);
  const role = roleResult.data;
  if (!role) return { error: "Selected role was not found." };
  const assignedUnits = unitsResult.data ?? [];

  const profilePatch: Record<string, unknown> = {
    role_id: role.id,
    updated_at: new Date().toISOString(),
  };
  if (input.name) profilePatch.full_name = input.name;
  if (input.email !== undefined) profilePatch.email = input.email;
  if (input.phone !== undefined) profilePatch.phone = input.phone;
  if (input.mustChangePassword !== undefined) profilePatch.must_change_password = input.mustChangePassword;
  if (input.isActive !== undefined) profilePatch.is_active = input.isActive;
  if (input.failedLoginAttempts !== undefined) profilePatch.failed_login_attempts = input.failedLoginAttempts;
  if (input.lockedAt !== undefined) profilePatch.locked_at = input.lockedAt;

  const { error: profileError } = await admin.from("profiles").update(profilePatch).eq("id", input.userId);
  if (profileError) return { error: "Unable to update the user profile." };

  await admin.from("user_business_units").delete().eq("user_id", input.userId);
  if (assignedUnits.length) {
    await admin.from("user_business_units").insert(
      assignedUnits.map((unit) => ({ user_id: input.userId, business_unit_id: unit.id })),
    );
  }

  const modules = input.moduleCodes.includes(ALL_MODULES_VALUE)
    ? ["*"]
    : assignedCodes;

  await admin.auth.admin.updateUserById(input.userId, {
    app_metadata: { role_code: input.roleCode, modules },
  });

  return { roleName: role.name as string, modules };
}

export async function createUserAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    roleCode: formData.get("roleCode"),
    modules: parseModules(formData),
  });
  if (!parsed.success) {
    return { error: "Enter a name, email or phone, module and role." };
  }

  const emailValue = parsed.data.email ? normalizeEmail(parsed.data.email) : "";
  const phoneValue = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (!emailValue && !phoneValue) {
    return { error: "Provide an email address or a phone number." };
  }
  if (emailValue && !z.string().email().safeParse(emailValue).success) {
    return { error: "Enter a valid email address." };
  }
  if (!isRoleAllowedForModules(parsed.data.roleCode, parsed.data.modules)) {
    return { error: "That role is not available for the selected module." };
  }

  const authEmail = emailValue || syntheticEmailForPhone(phoneValue!);
  const temporaryPassword = generateTemporaryPassword();
  const assignedCodes = modulesForAssignment(parsed.data.modules);
  const metadataModules = parsed.data.modules.includes(ALL_MODULES_VALUE) ? ["*"] : assignedCodes;
  const { admin } = ready;

  const catalog = await getAccessCatalog();
  const role =
    catalog.roles.find((item) => item.code === parsed.data.roleCode) ??
    (
      await admin.from("roles").select("id, code, name").eq("code", parsed.data.roleCode).maybeSingle()
    ).data;
  if (!role) {
    return { error: "Selected role was not found." };
  }
  let assignedUnits = catalog.units.filter((unit) =>
    assignedCodes.includes(unit.code as (typeof assignedCodes)[number]),
  );
  if (assignedCodes.length && assignedUnits.length === 0) {
    const { data } = await admin.from("business_units").select("id, code, name").in("code", assignedCodes);
    assignedUnits = (data ?? []) as typeof catalog.units;
  }

  const created = await admin.auth.admin.createUser({
    email: authEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.name,
      phone: phoneValue,
    },
    app_metadata: {
      role_code: parsed.data.roleCode,
      modules: metadataModules,
    },
  });

  if (created.error || !created.data.user) {
    return { error: created.error?.message || "Unable to create the user in Supabase Auth." };
  }

  const createdAt = new Date().toISOString();
  const { error: profileError } = await admin.from("profiles").insert({
    id: created.data.user.id,
    full_name: parsed.data.name,
    email: authEmail,
    phone: phoneValue,
    role_id: role.id,
    is_active: true,
    must_change_password: true,
    failed_login_attempts: 0,
    locked_at: null,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return { error: "Unable to save the user profile." };
  }

  if (assignedUnits.length) {
    const { error: assignmentError } = await admin.from("user_business_units").insert(
      assignedUnits.map((unit) => ({ user_id: created.data.user.id, business_unit_id: unit.id })),
    );
    if (assignmentError) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      return { error: "Unable to assign modules." };
    }
  }

  const roleName = role.name || roleDefinition(parsed.data.roleCode)?.name || parsed.data.roleCode;
  const createdUser: ManagedUser = {
    id: created.data.user.id,
    name: parsed.data.name,
    email: emailValue || authEmail,
    phone: phoneValue,
    loginIdentifier: displayLoginIdentifier({ email: emailValue || authEmail, phone: phoneValue }),
    roleCode: parsed.data.roleCode,
    roleName,
    modules: metadataModules,
    moduleNames: metadataModules.includes("*")
      ? ["All modules"]
      : assignedUnits.map((unit) => unit.name),
    isActive: true,
    mustChangePassword: true,
    failedLoginAttempts: 0,
    lockedAt: null,
    lastLoginAt: null,
    createdAt,
    status: "pending_password",
  };
  createdUser.status = statusOf(createdUser);

  return {
    credentials: {
      name: parsed.data.name,
      loginIdentifier: emailValue || phoneValue || authEmail,
      temporaryPassword,
      modules: metadataModules,
      roleName,
    },
    createdUser,
  };
}

export async function resetPasswordAction(userId: string): Promise<UsersActionState> {
  const actor = await requireVerifiedOwner();
  if (userId === actor.id) {
    return { error: "You cannot reset your own password from this screen." };
  }
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const users = await listManagedUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) return { error: "User was not found." };

  const temporaryPassword = generateTemporaryPassword();
  const { error } = await ready.admin.auth.admin.updateUserById(userId, { password: temporaryPassword });
  if (error) return { error: "Unable to reset the password." };

  await ready.admin
    .from("profiles")
    .update({
      must_change_password: true,
      failed_login_attempts: 0,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  revalidatePath("/owner/users");
  return {
    credentials: {
      name: target.name,
      loginIdentifier: target.loginIdentifier,
      temporaryPassword,
      modules: target.moduleNames,
      roleName: target.roleName,
    },
  };
}

export async function unlockUserAction(userId: string): Promise<{ error?: string }> {
  const actor = await requireVerifiedOwner();
  if (userId === actor.id) return { error: "You cannot unlock your own account from this screen." };
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  await ready.admin
    .from("profiles")
    .update({
      locked_at: null,
      failed_login_attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  revalidatePath("/owner/users");
  return {};
}

export async function disableUserAction(userId: string): Promise<{ error?: string }> {
  const actor = await requireVerifiedOwner();
  if (userId === actor.id) return { error: "You cannot disable your own account." };
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const users = await listManagedUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) return { error: "User was not found." };
  if (isOwnerRole(target.roleCode) && (await ownerCount(ready.admin)) <= 1) {
    return { error: "The only Owner account cannot be disabled." };
  }

  await ready.admin
    .from("profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  revalidatePath("/owner/users");
  return {};
}

export async function enableUserAction(userId: string): Promise<{ error?: string }> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  await ready.admin
    .from("profiles")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", userId);
  revalidatePath("/owner/users");
  return {};
}

export async function updateUserAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const actor = await requireVerifiedOwner();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User was not found." };
  if (userId === actor.id) {
    return { error: "You cannot change your own role or module access." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    roleCode: formData.get("roleCode"),
    modules: parseModules(formData),
  });
  if (!parsed.success) return { error: "Enter valid user details." };
  if (!isRoleAllowedForModules(parsed.data.roleCode, parsed.data.modules)) {
    return { error: "That role is not available for the selected module." };
  }

  const users = await listManagedUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) return { error: "User was not found." };
  if (isOwnerRole(target.roleCode) && !isOwnerRole(parsed.data.roleCode)) {
    const ready = adminOrError();
    if (!ready.ok) return { error: ready.error };
    if ((await ownerCount(ready.admin)) <= 1) {
      return { error: "The only Owner account cannot be demoted." };
    }
  }

  const result = await setUserAccess({
    userId,
    name: parsed.data.name,
    phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
    roleCode: parsed.data.roleCode,
    moduleCodes: parsed.data.modules,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/owner/users");
  return {};
}

export type { ManagedUser };
