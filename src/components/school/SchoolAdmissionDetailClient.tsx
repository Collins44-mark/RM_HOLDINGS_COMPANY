"use client";

import { useEffect, useState } from "react";
import { getSchoolAdmissionAction, type AdmissionDetail } from "@/actions/school/admissions";
import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";
import { peekAdmissionDetail, peekAdmissionView, writeAdmissionDetail } from "@/lib/school/admission-flash";
import { pendingSchoolAdmission } from "@/lib/school/admission-prefetch";

export function SchoolAdmissionDetailClient({ admissionId }: { admissionId: string }) {
  const cached = peekAdmissionDetail(admissionId);
  const heading = peekAdmissionView(admissionId);
  const [admission, setAdmission] = useState<AdmissionDetail | null>(cached?.admission ?? null);
  const [canManage, setCanManage] = useState(cached?.canManage ?? false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const pending = pendingSchoolAdmission(admissionId);
      if (pending) await pending;
      if (!active) return;
      const ready = peekAdmissionDetail(admissionId);
      if (ready) {
        setAdmission(ready.admission);
        setCanManage(ready.canManage);
        return;
      }
      const result = await getSchoolAdmissionAction(admissionId);
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      writeAdmissionDetail(result.admission, result.capabilities.canManage);
      setAdmission(result.admission);
      setCanManage(result.capabilities.canManage);
    })();
    return () => {
      active = false;
    };
  }, [admissionId]);

  return (
    <SchoolAdmissionDetailPage
      admission={admission}
      canManage={canManage}
      error={error}
      pending={!admission && !error}
      heading={
        heading
          ? {
              admissionNumber: heading.admissionNumber,
              studentName: heading.studentName,
            }
          : null
      }
    />
  );
}
