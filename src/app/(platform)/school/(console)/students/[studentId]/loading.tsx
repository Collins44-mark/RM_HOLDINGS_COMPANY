import { SchoolStudentProfilePage } from "@/components/school/SchoolStudentProfilePage";

export default function StudentDetailLoading() {
  return <SchoolStudentProfilePage student={null} error={null} pending />;
}
