"use client";

import { getSchoolAdmissionAction } from "@/actions/school/admissions";
import { peekAdmissionDetail, writeAdmissionDetail } from "@/lib/school/admission-flash";

const inflight = new Map<string, Promise<void>>();

export function prefetchSchoolAdmission(id: string) {
  if (!id || peekAdmissionDetail(id) || inflight.has(id)) return;
  const request = getSchoolAdmissionAction(id)
    .then((result) => {
      if (result.ok) writeAdmissionDetail(result.admission, result.capabilities.canManage);
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, request);
}

export function pendingSchoolAdmission(id: string) {
  return inflight.get(id) ?? null;
}
