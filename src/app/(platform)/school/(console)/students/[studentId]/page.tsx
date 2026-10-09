import { getSchoolStudentAction } from "@/actions/school/students";
import { SchoolStudentProfilePage } from "@/components/school/SchoolStudentProfilePage";

export const metadata = { title: "Student" };

export default async function SchoolStudentProfileRoute({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const result = await getSchoolStudentAction(studentId);
  return (
    <SchoolStudentProfilePage
      student={result.ok ? result.student : null}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
