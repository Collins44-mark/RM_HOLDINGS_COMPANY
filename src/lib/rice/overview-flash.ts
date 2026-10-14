import type { ReportPeriod } from "@/lib/data/report-period";
import type { RiceOverviewView } from "@/lib/rice/overview";

export type RiceOverviewSnapshot = {
  overview: RiceOverviewView;
  period: ReportPeriod;
  periodLabel: string;
};

let snapshot: RiceOverviewSnapshot | null = null;

export function rememberRiceOverview(next: RiceOverviewSnapshot) {
  snapshot = next;
}

export function peekRiceOverview() {
  return snapshot;
}
