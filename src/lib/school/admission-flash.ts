import type { AdmissionDetail, AdmissionListRow } from "@/actions/school/admissions";
import type { GuardianListRow } from "@/actions/school/parents";
import type { StudentListRow } from "@/actions/school/students";
import type { FeeAccountListRow } from "@/lib/school/fee-types";

const ADMISSION_KEY = "school.admissions.latest";
const ADMISSION_VIEW_KEY = "school.admissions.view";
const FEE_KEY = "school.fees.latest";
const STUDENT_KEY = "school.students.latest";
const GUARDIAN_KEY = "school.guardians.latest";

export type AdmissionFlash = AdmissionListRow;
export type FeeFlash = FeeAccountListRow;

export function writeAdmissionFlash(row: AdmissionFlash) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMISSION_KEY, JSON.stringify(row));
}

export function writeAdmissionView(row: AdmissionListRow) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMISSION_VIEW_KEY, JSON.stringify(row));
}

export function admissionPreviewFromList(row: AdmissionListRow): AdmissionDetail {
  return {
    id: row.id,
    admissionNumber: row.admissionNumber,
    status: row.status,
    admissionDate: row.admissionDate,
    academicYearId: "",
    academicYearName: "",
    termId: "",
    termName: "",
    levelId: "",
    levelName: row.levelName,
    classId: "",
    className: row.className,
    streamId: "",
    streamName: row.streamName,
    firstName: row.firstName || row.studentName,
    middleName: row.middleName || "",
    lastName: row.lastName || "",
    dateOfBirth: "",
    gender: "",
    nationality: "",
    address: "",
    phone: "",
    email: "",
    guardianFullName: "",
    guardianRelationship: "",
    guardianPhone: "",
    guardianEmail: "",
    guardianAddress: "",
    guardianOccupation: "",
    studentId: null,
    studentNumber: row.studentNumber,
    attendanceEligible: false,
    fee: {
      configured: false,
      annualAmount: null,
      currentTermName: null,
      currentTermAmount: null,
      termCount: 0,
      message: "",
    },
  };
}

export function peekAdmissionView(id?: string): AdmissionListRow | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADMISSION_VIEW_KEY);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as AdmissionListRow;
    if (id && row.id !== id) return null;
    return row;
  } catch {
    return null;
  }
}

export function consumeAdmissionFlash(): AdmissionFlash | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADMISSION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(ADMISSION_KEY);
  try {
    return JSON.parse(raw) as AdmissionFlash;
  } catch {
    return null;
  }
}

export function writeFeeFlash(row: FeeFlash) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FEE_KEY, JSON.stringify(row));
}

export function consumeFeeFlash(): FeeFlash | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FEE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(FEE_KEY);
  try {
    return JSON.parse(raw) as FeeFlash;
  } catch {
    return null;
  }
}

export type StudentFlash = StudentListRow;
export type GuardianFlash = GuardianListRow;

export function writeStudentFlash(row: StudentFlash) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STUDENT_KEY, JSON.stringify(row));
}

export function consumeStudentFlash(): StudentFlash | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STUDENT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(STUDENT_KEY);
  try {
    return JSON.parse(raw) as StudentFlash;
  } catch {
    return null;
  }
}

export function writeGuardianFlash(row: GuardianFlash) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(GUARDIAN_KEY, JSON.stringify(row));
}

export function consumeGuardianFlash(): GuardianFlash | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(GUARDIAN_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(GUARDIAN_KEY);
  try {
    return JSON.parse(raw) as GuardianFlash;
  } catch {
    return null;
  }
}
