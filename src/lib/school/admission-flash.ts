import type { AdmissionListRow } from "@/actions/school/admissions";
import type { FeeAccountListRow } from "@/lib/school/fee-types";

const ADMISSION_KEY = "school.admissions.latest";
const FEE_KEY = "school.fees.latest";

export type AdmissionFlash = AdmissionListRow;
export type FeeFlash = FeeAccountListRow;

export function writeAdmissionFlash(row: AdmissionFlash) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMISSION_KEY, JSON.stringify(row));
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
