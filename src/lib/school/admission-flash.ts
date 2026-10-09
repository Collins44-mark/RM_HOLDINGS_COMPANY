import type { AdmissionDetail, AdmissionListRow } from "@/actions/school/admissions";
import type { GuardianListRow } from "@/actions/school/parents";
import type { StudentListRow } from "@/actions/school/students";
import type { FeeAccountListRow } from "@/lib/school/fee-types";
import type { SchoolPageMeta } from "@/lib/school/pagination";

const ADMISSION_KEY = "school.admissions.latest";
const ADMISSION_VIEW_KEY = "school.admissions.view";
const ADMISSION_DETAIL_KEY = "school.admissions.detail";
const ADMISSION_LIST_KEY = "school.admissions.list";
const FEE_KEY = "school.fees.latest";
const FEE_VIEW_KEY = "school.fees.view";
const FEE_LIST_KEY = "school.fees.list";
const STUDENT_KEY = "school.students.latest";
const GUARDIAN_KEY = "school.guardians.latest";

export type AdmissionsListSnapshot = {
  rows: AdmissionListRow[];
  page: SchoolPageMeta;
  pageSize: number;
  filter: string;
  q: string;
};

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

export type AdmissionDetailCache = {
  admission: AdmissionDetail;
  canManage: boolean;
};

export function writeAdmissionDetail(admission: AdmissionDetail, canManage: boolean) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMISSION_DETAIL_KEY, JSON.stringify({ admission, canManage } satisfies AdmissionDetailCache));
}

export function peekAdmissionDetail(id?: string): AdmissionDetailCache | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADMISSION_DETAIL_KEY);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as AdmissionDetailCache;
    if (!row?.admission?.id) return null;
    if (id && row.admission.id !== id) return null;
    return row;
  } catch {
    return null;
  }
}

export function writeAdmissionsListSnapshot(snapshot: AdmissionsListSnapshot) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMISSION_LIST_KEY, JSON.stringify(snapshot));
}

export function peekAdmissionsListSnapshot(): AdmissionsListSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADMISSION_LIST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdmissionsListSnapshot;
  } catch {
    return null;
  }
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

export type FeesListSnapshot = {
  rows: FeeAccountListRow[];
  page: SchoolPageMeta;
  summary: { totalFees: number; collected: number; outstanding: number; studentsWithBalance: number };
  yearId: string;
  levelId: string;
  classId: string;
  status: string;
  q: string;
};

export type FeeViewHeading = {
  enrollmentId: string;
  studentName: string;
  studentNumber: string;
};

export function writeFeeFlash(row: FeeFlash) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FEE_KEY, JSON.stringify(row));
}

export function writeFeeView(row: FeeViewHeading) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FEE_VIEW_KEY, JSON.stringify(row));
}

export function peekFeeView(enrollmentId?: string): FeeViewHeading | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FEE_VIEW_KEY);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as FeeViewHeading;
    if (enrollmentId && row.enrollmentId !== enrollmentId) return null;
    return row;
  } catch {
    return null;
  }
}

export function writeFeesListSnapshot(snapshot: FeesListSnapshot) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FEE_LIST_KEY, JSON.stringify(snapshot));
}

export function peekFeesListSnapshot(): FeesListSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FEE_LIST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FeesListSnapshot;
  } catch {
    return null;
  }
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
