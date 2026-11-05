import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { recordExpensePayment } from "@/lib/beekeeping/write";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ready = await beeContext("beekeeping.expenses.pay");
    if ("error" in ready) return ready.error;
    const { id } = await params;
    const result = await recordExpensePayment(ready.admin, ready.buId, ready.user.authUid || ready.user.id, id, await req.json());
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: "expense.payment_recorded",
      description: `Recorded a payment for ${result.data?.expense_code}.`,
      entityType: "bee_expense_payment",
      entityId: result.paymentId,
      metadata: { expenseId: id },
    });
  } catch (error) {
    return beeFail(error);
  }
}
