import { getSchoolAdmissionAction } from "@/actions/school/admissions";
import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";

export const metadata = { title: "Edit Admission" };

const EMPTY_OPTIONS = {
  years: [] as Array<{ id: string; name: string; isCurrent: boolean }>,
  terms: [] as Array<{ id: string; academicYearId: string; name: string }>,
  levels: [] as Array<{ id: string; name: string }>,
  classes: [] as Array<{ id: string; name: string; levelId: string }>,
  streams: [] as Array<{ id: string; name: string; classId: string }>,
  today: "",
  capabilities: { canView: true, canManage: true, canConfigureAcademic: false },
};

export default async function SchoolEditAdmissionRoute({
  params,
}: {
  params: Promise<{ admissionId: string }>;
}) {
  const { admissionId } = await params;
  const detail = await getSchoolAdmissionAction(admissionId);
  return (
    <SchoolAdmissionFormPage
      options={EMPTY_OPTIONS}
      admission={detail.ok ? detail.admission : null}
      error={detail.ok ? null : detail.error}
      loadOptions
    />
  );
}
