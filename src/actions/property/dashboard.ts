import { prisma } from "@/lib/db";
import { formatTzs } from "@/lib/format/currency";

export async function getPropertyDashboardData() {
  const [properties, units, invoices, rentAggregate, contracts, hallBookings, expenses] = await Promise.all([
    prisma.property.count(),
    prisma.propertyUnit.findMany({ include: { property: true } }),
    prisma.rentInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { contract: { include: { unit: { include: { property: true } }, tenant: true } } },
    }),
    prisma.rentPayment.aggregate({ _sum: { amount: true } }),
    prisma.rentalContract.count(),
    prisma.hallBooking.count(),
    prisma.propertyExpense.aggregate({ _sum: { amount: true } }),
  ]);

  const totalUnits = units.length;
  const occupied = units.filter((u) => u.status === "occupied").length;
  const vacant = totalUnits - occupied;
  const occupancyPct = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

  const paid = await prisma.rentInvoice.count({ where: { status: "paid" } });
  const unpaid = await prisma.rentInvoice.count({ where: { status: "pending" } });
  const overdue = await prisma.rentInvoice.count({ where: { status: "overdue" } });
  const totalInv = await prisma.rentInvoice.count();

  const paidAmount = await prisma.rentInvoice.aggregate({
    where: { status: "paid" },
    _sum: { amount: true },
  });
  const unpaidAmount = await prisma.rentInvoice.aggregate({
    where: { status: "pending" },
    _sum: { amount: true },
  });
  const overdueAmount = await prisma.rentInvoice.aggregate({
    where: { status: "overdue" },
    _sum: { amount: true },
  });

  const paymentsList = await prisma.rentPayment.findMany({
    orderBy: { paidAt: "asc" },
    select: { amount: true, paidAt: true },
  });
  const monthlyIncome = paymentsList.reduce<Record<string, number>>((acc, p) => {
    const key = p.paidAt ? new Date(p.paidAt).toLocaleString("en-US", { month: "short", year: "numeric" }) : "";
    acc[key] = (acc[key] ?? 0) + Number(p.amount);
    return acc;
  }, {});
  const monthlyIncomeArr = Object.entries(monthlyIncome).map(([month, amount]) => ({ month, amount: amount as number }));

  return {
    stats: {
      properties,
      totalUnits,
      occupied,
      vacant,
      occupancyPct,
      rentCollected: Number(rentAggregate?._sum?.amount ?? 0),
      paid,
      unpaid,
      overdue,
      totalInv,
      paidAmount: Number(paidAmount._sum.amount ?? 0),
      unpaidAmount: Number(unpaidAmount._sum.amount ?? 0),
      overdueAmount: Number(overdueAmount._sum.amount ?? 0),
    },
    recentInvoices: invoices,
    monthlyIncome: monthlyIncomeArr,
    hallBookings,
    contracts,
    expenses: Number(expenses?._sum?.amount ?? 0),
    units,
  };
}
