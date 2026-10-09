"use client";

import { useParams } from "next/navigation";
import { SchoolStudentFeeProfilePage } from "@/components/school/SchoolStudentFeeProfilePage";
import { peekFeeView } from "@/lib/school/admission-flash";

export default function SchoolFeeProfileLoading() {
  const params = useParams<{ enrollmentId: string }>();
  const enrollmentId = String(params?.enrollmentId ?? "");
  const heading = typeof window !== "undefined" ? peekFeeView(enrollmentId) : null;
  return (
    <SchoolStudentFeeProfilePage
      account={null}
      capabilities={null}
      error={null}
      pending
      heading={heading ?? undefined}
    />
  );
}
