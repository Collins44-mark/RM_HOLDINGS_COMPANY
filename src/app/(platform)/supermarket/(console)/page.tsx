import { SupermarketDashboard } from "@/components/supermarket/SupermarketDashboard";
import type { SupermarketSampleDashboard } from "@/lib/data/sample-supermarket";
import { getDashboardMetricsAction } from "@/actions/supermarket/sales";
import { loadInventorySnapshot } from "@/lib/supermarket/queries";

export const metadata = { title: "Supermarket" };

function emptyDashboard(error?: string): SupermarketSampleDashboard {
  return {
    kpis: {
      todaySales: 0,
      todaySalesDelta: 0,
      todayOrders: 0,
      todayOrdersDelta: 0,
      grossProfit: 0,
      grossProfitDelta: 0,
      inventoryValue: 0,
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
  try {
    const [metricsResult, inventory] = await Promise.all([
      getDashboardMetricsAction(),
      loadInventorySnapshot(),
    ]);

    if (!metricsResult.ok) {
      return <SupermarketDashboard data={emptyDashboard(metricsResult.error)} />;
    }
    if (inventory.error) {
      return <SupermarketDashboard data={emptyDashboard(inventory.error)} />;
    }

    const { metrics } = metricsResult;
    const stockByProduct = new Map<string, number>();
    for (const batch of inventory.batches) {
      stockByProduct.set(batch.productId, (stockByProduct.get(batch.productId) ?? 0) + batch.quantity);
    }
    const inventoryValue = inventory.products.reduce((sum, product) => {
      const stock = stockByProduct.get(product.id) ?? 0;
      return sum + stock * product.buyingPrice;
    }, 0);

    const data: SupermarketSampleDashboard = {
      kpis: {
        todaySales: metrics.todayRevenue,
        todaySalesDelta: 0,
        todayOrders: metrics.todaySalesCount,
        todayOrdersDelta: 0,
        grossProfit: metrics.todayProfit,
        grossProfitDelta: 0,
        inventoryValue,
      },
      salesOverview: {
        today: metrics.todayRevenue,
        week: metrics.todayRevenue,
        month: metrics.todayRevenue,
        trend: [],
      },
      stockAlerts: [
        {
          id: "low",
          label: "Low stock",
          count: metrics.lowStockCount,
          hint: "Below reorder level",
          href: "/supermarket/stock",
          tone: "watch",
        },
        {
          id: "out",
          label: "Out of stock",
          count: metrics.outOfStockCount,
          hint: "Needs replenishment",
          href: "/supermarket/stock",
          tone: "critical",
        },
      ],
      recentSales: (
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
      })),
      topProducts: metrics.topLowStock.map((item) => ({
        name: item.name,
        sold: item.stock,
      })),
      recentPurchases: (
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
      })),
    };

    return <SupermarketDashboard data={data} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dashboard";
    return <SupermarketDashboard data={emptyDashboard(message)} />;
  }
}
