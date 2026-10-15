export type FarmLedgerJob = {
  id: string;
  occurredOn: string;
  completedOn: string | null;
  partyId: string;
  agreedPrice: number;
  amountPaid: number;
  status: string;
  isActive: boolean;
};

export type FarmLedgerExpense = {
  id: string;
  occurredOn: string;
  amount: number;
  kind: string;
  sourceType: string;
  sourceId: string | null;
  isActive: boolean;
};

export type FarmFinanceSummary = {
  serviceIncome: number;
  received: number;
  receivables: number;
  fuelExpense: number;
  maintenanceExpense: number;
  labourExpense: number;
  operatingExpense: number;
  otherExpense: number;
  tractorExpense: number;
  expenses: number;
  netProfit: number;
  completedJobs: number;
  customersServed: number;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  const next = new Map<string, T>();
  for (const row of rows) next.set(row.id, row);
  return [...next.values()];
}

export function jobBalance(job: Pick<FarmLedgerJob, "agreedPrice" | "amountPaid" | "status">) {
  const total = money(job.agreedPrice);
  const paid = money(Math.max(0, job.amountPaid));
  return {
    total,
    paid: Math.min(paid, total),
    receivable: job.status === "CANCELLED" ? 0 : money(Math.max(0, total - paid)),
    status: paid <= 0 ? "Unpaid" : paid >= total ? "Paid" : "Partial",
  };
}

export function summarizeFarmLedgers(input: {
  from: string;
  to: string;
  jobs: FarmLedgerJob[];
  expenses: FarmLedgerExpense[];
}): FarmFinanceSummary {
  const jobs = uniqueById(input.jobs).filter((row) => row.isActive);
  const expenses = uniqueById(input.expenses).filter((row) => row.isActive);
  const completed = jobs.filter(
    (row) => row.status === "COMPLETED" && inRange(row.completedOn ?? row.occurredOn, input.from, input.to),
  );
  const periodExpenses = expenses.filter((row) => inRange(row.occurredOn, input.from, input.to));

  const serviceIncome = money(completed.reduce((sum, row) => sum + row.agreedPrice, 0));
  const received = money(completed.reduce((sum, row) => sum + Math.min(row.amountPaid, row.agreedPrice), 0));
  const receivables = money(
    jobs
      .filter((row) => row.status === "COMPLETED")
      .reduce((sum, row) => sum + Math.max(0, row.agreedPrice - row.amountPaid), 0),
  );

  const byKind = (kind: string) => money(periodExpenses.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.amount, 0));
  const fuelExpense = byKind("FUEL");
  const maintenanceExpense = byKind("MAINTENANCE");
  const labourExpense = byKind("LABOUR");
  const operatingExpense = byKind("OPERATING");
  const otherExpense = byKind("OTHER");
  const tractorExpense = money(fuelExpense + maintenanceExpense);
  const expenseTotal = money(fuelExpense + maintenanceExpense + labourExpense + operatingExpense + otherExpense);
  const customers = new Set(completed.map((row) => row.partyId));

  return {
    serviceIncome,
    received,
    receivables,
    fuelExpense,
    maintenanceExpense,
    labourExpense,
    operatingExpense,
    otherExpense,
    tractorExpense,
    expenses: expenseTotal,
    netProfit: money(serviceIncome - expenseTotal),
    completedJobs: completed.length,
    customersServed: customers.size,
  };
}
