import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { recordSalePayment } from "@/lib/beekeeping/write";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ready = await beeContext("beekeeping.sales.pay");
    if ("error" in ready) return ready.error;
    const { id } = await params;
    const result = await recordSalePayment(ready.admin, ready.buId, ready.user.authUid || ready.user.id, id, await req.json());
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: "sale.payment_recorded",
      description: `Recorded a payment for ${result.data?.sale_code}.`,
      entityType: "bee_sale_payment",
      entityId: result.paymentId,
      metadata: { saleId: id },
    });
  } catch (error) {
    return beeFail(error);
  }
}
