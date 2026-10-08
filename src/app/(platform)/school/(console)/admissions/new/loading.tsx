import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";

const EMPTY_OPTIONS = {
  years: [] as Array<{ id: string; name: string; isCurrent: boolean }>,
  terms: [] as Array<{ id: string; academicYearId: string; name: string }>,
  levels: [] as Array<{ id: string; name: string }>,
  classes: [] as Array<{ id: string; name: string; levelId: string }>,
  streams: [] as Array<{ id: string; name: string; classId: string }>,
  today: "",
  capabilities: { canView: true, canManage: true, canConfigureAcademic: false },
};

/** Instant form shell while the route module resolves — not a skeleton or blank page. */
export default function NewAdmissionLoading() {
  return <SchoolAdmissionFormPage options={EMPTY_OPTIONS} admission={null} error={null} />;
}
