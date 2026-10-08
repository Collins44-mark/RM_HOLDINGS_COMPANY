"use client";

import { useEffect, useState } from "react";
import { getSchoolAdmissionAction, type AdmissionDetail } from "@/actions/school/admissions";
import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";
import { admissionPreviewFromList, peekAdmissionView } from "@/lib/school/admission-flash";

export function SchoolAdmissionDetailClient({ admissionId }: { admissionId: string }) {
  const snapshot = peekAdmissionView(admissionId);
  const [admission, setAdmission] = useState<AdmissionDetail | null>(
    snapshot ? admissionPreviewFromList(snapshot) : null,
  );
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    void getSchoolAdmissionAction(admissionId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdmission(result.admission);
      setCanManage(result.capabilities.canManage);
      setComplete(true);
    });
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
      preview={Boolean(admission) && !complete}
    />
  );
}
