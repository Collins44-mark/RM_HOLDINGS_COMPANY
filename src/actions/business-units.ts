"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/session";
import {
  BUSINESS_UNITS_CACHE_TAG,
  updateBusinessUnitLocation,
  updateBusinessUnitName,
} from "@/lib/data/business-units";
import { writeAuditEvent } from "@/lib/audit";

export type BusinessUnitLocationState = {
  error?: string;
  ok?: boolean;
} | null;

const schema = z.object({
  businessUnitId: z.string().uuid(),
  location: z.string().trim().max(160),
});

export async function saveBusinessUnitLocationAction(
  _prev: BusinessUnitLocationState,
  formData: FormData,
): Promise<BusinessUnitLocationState> {
  await requirePlatformAdmin();

  const parsed = schema.safeParse({
    businessUnitId: formData.get("businessUnitId"),
    location: formData.get("location") ?? "",
  });

  if (!parsed.success) {
    return { error: "Enter a valid business unit and location." };
  }

  const result = await updateBusinessUnitLocation({
    id: parsed.data.businessUnitId,
    location: parsed.data.location,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  if (!result.unchanged) {
    const previous = result.previousLocation?.trim() || "Location not set";
    const next = result.nextLocation?.trim() || "Location not set";
    await writeAuditEvent({
      action: "business_unit.location_updated",
      module: "settings",
      description: `Updated business unit location. Business Unit: ${result.name}. Old: ${previous}. New: ${next}`,
      severity: "medium",
      entityType: "business_unit",
      entityId: parsed.data.businessUnitId,
      businessUnitId: parsed.data.businessUnitId,
      metadata: {
        business_unit: result.name,
        previous_location: previous,
        next_location: next,
      },
    });
  }

  updateTag(BUSINESS_UNITS_CACHE_TAG);
  revalidatePath("/owner/business-units");
  revalidatePath("/owner/settings");
  revalidatePath("/workspace");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");

  return { ok: true };
}

const nameSchema = z.object({
  businessUnitId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

export async function saveBusinessUnitNameAction(
  _prev: BusinessUnitLocationState,
  formData: FormData,
): Promise<BusinessUnitLocationState> {
  await requirePlatformAdmin();

  const parsed = nameSchema.safeParse({
    businessUnitId: formData.get("businessUnitId"),
    name: formData.get("name") ?? "",
  });

  if (!parsed.success) {
    return { error: "Enter a name between 2 and 80 characters." };
  }

  const result = await updateBusinessUnitName({
    id: parsed.data.businessUnitId,
    name: parsed.data.name,
  });
  if (!result.ok) return { error: result.error };

  if (!result.unchanged) {
    await writeAuditEvent({
      action: "business_unit.name_updated",
      module: "settings",
      description: `Updated business unit name. Old: ${result.previousName}. New: ${result.name}`,
      severity: "medium",
      entityType: "business_unit",
      entityId: parsed.data.businessUnitId,
      businessUnitId: parsed.data.businessUnitId,
      metadata: {
        previous_name: result.previousName,
        next_name: result.name,
      },
    });
  }

  updateTag(BUSINESS_UNITS_CACHE_TAG);
  revalidatePath("/owner/business-units");
  revalidatePath("/owner/settings");
  revalidatePath("/workspace");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");

  return { ok: true };
}
