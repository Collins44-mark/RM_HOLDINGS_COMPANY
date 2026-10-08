import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";

export const metadata = { title: "New Admission" };
export const dynamic = "force-dynamic";

const EMPTY_OPTIONS = {
  years: [] as Array<{ id: string; name: string; isCurrent: boolean }>,
  terms: [] as Array<{ id: string; academicYearId: string; name: string }>,
  levels: [] as Array<{ id: string; name: string }>,
  classes: [] as Array<{ id: string; name: string; levelId: string }>,
  streams: [] as Array<{ id: string; name: string; classId: string }>,
  today: "",
  capabilities: { canView: true, canManage: true, canConfigureAcademic: false },
};

export default function SchoolNewAdmissionRoute() {
  return <SchoolAdmissionFormPage options={EMPTY_OPTIONS} admission={null} error={null} loadOptions />;
}
