import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { presentDirectory } from "@/lib/beekeeping/directory";
import { buildBeeReportPdf } from "@/lib/beekeeping/report-pdf";
import { buildBeeReport } from "@/lib/beekeeping/reports";

export async function GET(req: Request) {
  try {
    const ready = await beeContext("beekeeping.reports.view");
    if ("error" in ready) return ready.error;
    const url = new URL(req.url);
    const reportId = url.searchParams.get("report") || "bee-hives";
    const from = url.searchParams.get("from") || "2000-01-01";
    const to = url.searchParams.get("to") || "2100-01-01";
    const period = url.searchParams.get("period") || `${from} to ${to}`;
    const [hives, harvests, sales, allocations, salePayments, expenses, expensePayments] = await Promise.all([
      ready.admin.from("bee_hives").select("*").eq("business_unit_id", ready.buId),
      ready.admin.from("bee_harvests").select("*").eq("business_unit_id", ready.buId),
      ready.admin.from("bee_sales").select("*").eq("business_unit_id", ready.buId),
      ready.admin.from("bee_stock_allocations").select("*").eq("business_unit_id", ready.buId),
      ready.admin.from("bee_sale_payments").select("*").eq("business_unit_id", ready.buId),
      ready.admin.from("bee_expenses").select("*").eq("business_unit_id", ready.buId),
      ready.admin.from("bee_expense_payments").select("*").eq("business_unit_id", ready.buId),
    ]);
    if (hives.error) return Response.json({ error: hives.error.message }, { status: 400 });
    const directory = presentDirectory({
      hives: hives.data || [],
      harvests: harvests.data || [],
      sales: sales.data || [],
      allocations: allocations.data || [],
      salePayments: salePayments.data || [],
      expenses: expenses.data || [],
      expensePayments: expensePayments.data || [],
      activities: [],
    });
    const report = buildBeeReport(reportId, directory, from, to);
    const bytes = buildBeeReportPdf(report, period, new Date().toISOString());
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RM-Holdings-${report.id}.pdf"`,
      },
    });
  } catch (error) {
    return beeFail(error);
  }
}
