import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { cancelExpense, updateExpense } from "@/lib/beekeeping/write";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const ready = await beeContext(body.cancel ? "beekeeping.expenses.cancel" : "beekeeping.expenses.edit");
    if ("error" in ready) return ready.error;
    const result = body.cancel ? await cancelExpense(ready.admin, ready.buId, id) : await updateExpense(ready.admin, ready.buId, id, body);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: body.cancel ? "expense.cancelled" : "expense.updated",
      description: body.cancel ? `Cancelled expense ${result.data?.expense_code}.` : `Updated expense ${result.data?.expense_code}.`,
      entityType: "bee_expense",
      entityId: id,
    });
  } catch (error) {
    return beeFail(error);
  }
}
