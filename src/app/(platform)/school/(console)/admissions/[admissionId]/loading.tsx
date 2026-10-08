"use client";

import { useParams } from "next/navigation";
import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";
import { admissionPreviewFromList, peekAdmissionView } from "@/lib/school/admission-flash";

export default function AdmissionDetailLoading() {
  const params = useParams<{ admissionId: string }>();
  const snapshot = peekAdmissionView(params.admissionId);
  return (
    <SchoolAdmissionDetailPage
      admission={snapshot ? admissionPreviewFromList(snapshot) : null}
      canManage={false}
      error={null}
      pending={!snapshot}
      preview={Boolean(snapshot)}
    />
  );
}
