import { getAdmissionFormOptionsAction, getSchoolAdmissionAction } from "@/actions/school/admissions";
import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";

export const metadata = { title: "Edit Admission" };

export default async function SchoolEditAdmissionRoute({
  params,
}: {
  params: Promise<{ admissionId: string }>;
}) {
  const { admissionId } = await params;
  const [options, detail] = await Promise.all([getAdmissionFormOptionsAction("manage"), getSchoolAdmissionAction(admissionId)]);
  return (
    <SchoolAdmissionFormPage
      options={options.ok ? options : null}
      admission={detail.ok ? detail.admission : null}
      error={detail.ok ? (options.ok ? null : options.error) : detail.error}
    />
  );
}
