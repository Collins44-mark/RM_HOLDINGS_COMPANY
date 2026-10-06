import { SupermarketDashboard } from "@/components/supermarket/SupermarketDashboard";
import type { SupermarketSampleDashboard } from "@/lib/data/sample-supermarket";
import { getDashboardMetricsAction } from "@/actions/supermarket/sales";

export const metadata = { title: "Supermarket" };

function emptyDashboard(error?: string): SupermarketSampleDashboard {
  return {
    widgets: { sales: false, profit: false, inventory: Boolean(error), purchases: false },
    kpis: {
      todaySales: 0,
      todaySalesDelta: 0,
      todayOrders: 0,
      todayOrdersDelta: 0,
      grossProfit: 0,
      grossProfitDelta: 0,
      inventoryValue: 0,
      stockUnits: 0,
      expiringSoon: 0,
      expired: 0,
    },
    salesOverview: { today: 0, week: 0, month: 0, trend: [] },
    stockAlerts: error
      ? [
          {
            id: "error",
            label: "Data unavailable",
            count: 0,
            hint: error,
            href: "/supermarket/stock",
            tone: "critical",
          },
        ]
      : [],
    recentSales: [],
    topProducts: [],
    recentPurchases: [],
  };
}

export default async function SupermarketHomePage() {
  let data: SupermarketSampleDashboard;
  try {
    const metricsResult = await getDashboardMetricsAction();

    if (!metricsResult.ok) {
      data = emptyDashboard(metricsResult.error);
    } else {
    const { metrics, widgets } = metricsResult;

    data = {
      widgets,
      kpis: {
        todaySales: metrics.todayRevenue,
        todaySalesDelta: 0,
        todayOrders: metrics.todaySalesCount,
        todayOrdersDelta: 0,
        grossProfit: metrics.todayProfit,
        grossProfitDelta: 0,
        inventoryValue: metrics.inventoryValue ?? 0,
        stockUnits: metrics.stockUnits ?? 0,
        expiringSoon: metrics.expiringSoonCount ?? 0,
        expired: metrics.expiredCount ?? 0,
      },
      salesOverview: {
        today: metrics.todayRevenue,
        week: metrics.todayRevenue,
        month: metrics.todayRevenue,
        trend: [],
      },
      stockAlerts: widgets.inventory
        ? [
            {
              id: "low",
              label: "Low stock",
              count: metrics.lowStockCount,
              hint: "Below reorder level",
              href: "/supermarket/stock",
              tone: "watch" as const,
            },
            {
              id: "out",
              label: "Out of stock",
              count: metrics.outOfStockCount,
              hint: "Needs replenishment",
              href: "/supermarket/stock",
              tone: "critical" as const,
            },
            {
              id: "soon",
              label: "Expiring soon",
              count: metrics.expiringSoonCount,
              hint: "Within 30 days",
              href: "/supermarket/stock",
              tone: "soon" as const,
            },
            {
              id: "expired",
              label: "Expired",
              count: metrics.expiredCount,
              hint: "Needs write-off",
              href: "/supermarket/stock",
              tone: "critical" as const,
            },
          ]
        : [],
      recentSales: widgets.sales
        ? (
            metrics.recentSales as {
              invoice_number: string;
              sale_date: string;
              total: number;
              customer_name: string;
            }[]
          ).map((sale) => ({
            invoice: sale.invoice_number,
            time: String(sale.sale_date).slice(11, 16) || "—",
            items: 0,
            cashier: "—",
            payment: "Cash" as const,
            amount: Number(sale.total) || 0,
            status: "Completed" as const,
          }))
        : [],
      topProducts: widgets.sales
        ? metrics.topLowStock.map((item) => ({
            name: item.name,
            sold: item.stock,
          }))
        : [],
      recentPurchases: widgets.purchases
        ? (
            metrics.recentPurchases as {
              receipt_number: string;
              received_at: string;
              total_cost: number;
            }[]
          ).map((purchase) => ({
            supplier: "Supplier",
            reference: purchase.receipt_number,
            date: String(purchase.received_at).slice(0, 10),
            amount: Number(purchase.total_cost) || 0,
            status: "Received" as const,
          }))
        : [],
    };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dashboard";
    data = emptyDashboard(message);
  }
  return <SupermarketDashboard data={data} />;
}
