export type OverviewMetric<T> =
  | { status: "unavailable"; reason: "not_implemented" }
  | { status: "error" }
  | { status: "ok"; value: T };

export type ConfigStatus = "configured" | "not_configured" | "enabled" | "disabled" | "error";

export type SchoolOverviewView = {
  schoolName: string;
  schoolCode: string;
  location: string;
  academicYear: { status: "ok"; name: string } | { status: "not_configured" } | { status: "conflict" } | { status: "error" };
  currentTerm: { status: "ok"; name: string } | { status: "none" } | { status: "multiple" } | { status: "error" };
  classLevels: OverviewMetric<number>;
  students: OverviewMetric<number>;
  teachers: OverviewMetric<number>;
  attendance: OverviewMetric<number>;
  feesCollected: OverviewMetric<number>;
  outstandingFees: OverviewMetric<number>;
  grading: ConfigStatus;
  attendanceRules: ConfigStatus;
  feeStructure: ConfigStatus;
  transport: ConfigStatus;
  capabilities: {
    canConfigure: boolean;
  };
  attention: string[];
};
