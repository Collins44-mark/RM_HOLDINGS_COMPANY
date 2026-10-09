"use client";

import { useParams } from "next/navigation";
import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";
import { peekAdmissionView } from "@/lib/school/admission-flash";

export default function AdmissionDetailLoading() {
  const params = useParams<{ admissionId: string }>();
  const heading = peekAdmissionView(params.admissionId);
  return (
    <SchoolAdmissionDetailPage
      admission={null}
      canManage={false}
      error={null}
      pending
      heading={
        heading
          ? { admissionNumber: heading.admissionNumber, studentName: heading.studentName }
          : { admissionNumber: "Admission" }
      }
    />
  );
}
