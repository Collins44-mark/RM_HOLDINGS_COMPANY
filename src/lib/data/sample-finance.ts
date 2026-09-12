export const SAMPLE_FINANCE_YEAR = 2026;

export const YEARLY_REVENUE: Record<string, number> = {
  rice: 320_500_000,
  farm: 185_200_000,
  supermarket: 450_750_000,
  property: 215_400_000,
  livestock: 162_800_000,
  school: 276_600_000,
  beekeeping: 124_500_000,
};

export const EXPENSE_RATIO: Record<string, number> = {
  rice: 0.62,
  farm: 0.71,
  supermarket: 0.78,
  property: 0.34,
  livestock: 0.68,
  school: 0.59,
  beekeeping: 0.48,
};

export function splitYear(total: number, year: number) {
  const weights = [7, 7, 8, 9, 9, 8, 9, 9, 9, 9, 8, 8];
  const sum = weights.reduce((a, b) => a + b, 0);
  const months = weights.map((weight, index) => ({
    month: index,
    amount: Math.floor((weight / sum) * total),
  }));
  const allocated = months.reduce((a, b) => a + b.amount, 0);
  months[11].amount += total - allocated;
  return months.map((item) => ({
    occurredAt: new Date(year, item.month, 18, 10, 0, 0),
    amount: item.amount,
  }));
}
