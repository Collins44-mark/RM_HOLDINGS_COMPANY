"use client";

import { usePathname } from "next/navigation";
import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";
import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";
import { SchoolAdmissionsPage } from "@/components/school/SchoolAdmissionsPage";
import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";
import { SchoolStudentProfilePage } from "@/components/school/SchoolStudentProfilePage";
import { SchoolStudentsPage } from "@/components/school/SchoolStudentsPage";
import { SchoolSubjectsPage } from "@/components/school/SchoolSubjectsPage";
import { SchoolExamsPage } from "@/components/school/SchoolExamsPage";
import { SchoolFeesPage } from "@/components/school/SchoolFeesPage";
import { SchoolStudentFeeProfilePage } from "@/components/school/SchoolStudentFeeProfilePage";
import { SchoolExpensesPage } from "@/components/school/SchoolExpensesPage";
import { SchoolSalaryPage } from "@/components/school/SchoolSalaryPage";
import { SchoolParentsPage } from "@/components/school/SchoolParentsPage";
import { SchoolReportsPage } from "@/components/school/SchoolReportsPage";
import { schoolPageMeta } from "@/lib/school/pagination";
import { peekAdmissionView, peekAdmissionsListSnapshot, peekFeeView, peekFeesListSnapshot } from "@/lib/school/admission-flash";
import { peekExamsListSnapshot } from "@/lib/school/exam-flash";

const EMPTY_OPTIONS = {
  years: [] as Array<{ id: string; name: string; isCurrent: boolean }>,
  terms: [] as Array<{ id: string; academicYearId: string; name: string }>,
  levels: [] as Array<{ id: string; name: string }>,
  classes: [] as Array<{ id: string; name: string; levelId: string }>,
  streams: [] as Array<{ id: string; name: string; classId: string }>,
  today: "",
  capabilities: { canView: true, canManage: true, canConfigureAcademic: false },
};

/**
 * Parent school loading used to return null, which replaced the console
 * slot with a blank page during client navigations. Render the destination
 * page shell immediately — not a giant skeleton.
 */
export default function SchoolConsoleLoading() {
  const pathname = usePathname();
  if (pathname === "/school/admissions/new" || (pathname.includes("/school/admissions/") && pathname.endsWith("/edit"))) {
    return <SchoolAdmissionFormPage options={EMPTY_OPTIONS} admission={null} error={null} />;
  }
  if (pathname === "/school/admissions") {
    const snapshot = typeof window !== "undefined" ? peekAdmissionsListSnapshot() : null;
    return (
      <SchoolAdmissionsPage
        admissions={snapshot?.rows ?? []}
        page={snapshot?.page ?? schoolPageMeta(1, 0)}
        canManage
        query={snapshot?.q ?? ""}
        status={snapshot?.filter ?? "all"}
        error={null}
        pending={!snapshot}
      />
    );
  }
  if (pathname.startsWith("/school/admissions/")) {
    const id = pathname.split("/")[3] ?? "";
    const heading = typeof window !== "undefined" ? peekAdmissionView(id) : null;
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
  if (pathname === "/school/students") {
    return (
      <SchoolStudentsPage
        students={[]}
        page={schoolPageMeta(1, 0)}
        levels={[]}
        query=""
        levelId=""
        classId=""
        streamId=""
        pageSize={20}
        error={null}
        pending
      />
    );
  }
  if (pathname.startsWith("/school/students/")) {
    return <SchoolStudentProfilePage student={null} error={null} pending />;
  }
  if (pathname === "/school/staff/new") {
    return <SchoolStaffFormPage types={[]} roles={[]} staff={null} error={null} />;
  }
  if (pathname === "/school/subjects") {
    return <SchoolSubjectsPage workspace={null} error={null} pending />;
  }
  if (pathname === "/school/exams-results" || pathname === "/school/exams") {
    const snapshot = typeof window !== "undefined" ? peekExamsListSnapshot() : null;
    return <SchoolExamsPage workspace={snapshot} error={null} pending={!snapshot} />;
  }
  if (pathname === "/school/fees") {
    const snapshot = typeof window !== "undefined" ? peekFeesListSnapshot() : null;
    return (
      <SchoolFeesPage
        initial={
          snapshot
            ? {
                ok: true,
                accounts: snapshot.rows,
                page: snapshot.page,
                summary: snapshot.summary,
                years: [],
                levels: [],
                academicYearId: snapshot.yearId,
                capabilities: { canView: true, canRecord: false, canVerify: false, canReceipt: false, canManageStructures: false },
              }
            : null
        }
        pending
      />
    );
  }
  if (pathname === "/school/expenses/salaries") {
    return <SchoolSalaryPage initial={null} pending />;
  }
  if (pathname === "/school/expenses") {
    return <SchoolExpensesPage initial={null} pending />;
  }
  if (pathname === "/school/reports") {
    return <SchoolReportsPage initial={null} pending />;
  }
  if (pathname === "/school/parents") {
    return (
      <SchoolParentsPage
        guardians={[]}
        page={schoolPageMeta(1, 0)}
        levels={[]}
        query=""
        levelId=""
        classId=""
        streamId=""
        pageSize={20}
        error={null}
        pending
      />
    );
  }
  if (pathname.startsWith("/school/fees/")) {
    const id = pathname.split("/")[3] ?? "";
    const heading = typeof window !== "undefined" ? peekFeeView(id) : null;
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
  return <div className="min-w-0 max-w-full pb-10" />;
}
