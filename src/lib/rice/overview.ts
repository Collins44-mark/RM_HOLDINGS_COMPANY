export type RiceMetricStatus = "ok" | "empty" | "unavailable" | "error";

export type RiceMetric<T> = {
  status: RiceMetricStatus;
  value: T | null;
  hint: string;
};

export type RiceGradeShare = {
  name: string;
  quantityKg: number;
  share: number;
};

export type RiceStockItem = {
  name: string;
  quantityKg: number;
  share: number;
};

export type RiceServiceIncomeRow = {
  name: string;
  amount: number;
  share: number;
};

export type RiceOverviewView = {
  unitName: string;
  location: string | null;
  isActive: boolean | null;
  periodLabel: string;
  todayLabel: string;
  companyPaddyKg: RiceMetric<number>;
  riceStockKg: RiceMetric<number>;
  totalSales: RiceMetric<number>;
  milledTodayKg: RiceMetric<number>;
  netProfit: RiceMetric<number>;
  stockByGrade: RiceMetric<RiceGradeShare[]>;
  currentStock: RiceMetric<RiceStockItem[]>;
  serviceIncome: RiceMetric<RiceServiceIncomeRow[]>;
  serviceIncomeTotal: RiceMetric<number>;
};

export const RICE_LEDGER_UNAVAILABLE =
  "Rice mill inventory, milling, sales and service ledgers are not in the live database yet. Figures are withheld until those records exist.";
