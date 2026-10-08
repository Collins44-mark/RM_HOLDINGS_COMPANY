"use client";

import { usePathname } from "next/navigation";
import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";

const EMPTY_OPTIONS = {
  years: [] as Array<{ id: string; name: string; isCurrent: boolean }>,
  terms: [] as Array<{ id: string; academicYearId: string; name: string }>,
  levels: [] as Array<{ id: string; name: string }>,
  today: "",
  capabilities: { canView: true, canManage: true, canConfigureAcademic: false },
};

/**
 * Parent school loading used to return null, which replaced the console
 * slot with a blank page during client navigations. Keep other school
 * routes without a giant skeleton; render the real New Admission shell
 * when that is the destination.
 */
export default function SchoolConsoleLoading() {
  const pathname = usePathname();
  if (pathname === "/school/admissions/new") {
    return <SchoolAdmissionFormPage options={EMPTY_OPTIONS} admission={null} error={null} />;
  }
  return null;
}
