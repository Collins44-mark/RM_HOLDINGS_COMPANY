import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { writeAuditEvent } from "@/lib/audit";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { denyBee } from "@/lib/beekeeping/access";
import { createSale } from "@/lib/beekeeping/write";

export async function POST(req: Request) {
  try {
    const ready = await beeContext("beekeeping.sales.create");
    if ("error" in ready) return ready.error;
    const body = await req.json();
    const paid = Number(body.amount_paid || 0);
    if (paid > 0) {
      const denied = denyBee(ready.user, "beekeeping.sales.pay");
      if (denied) return Response.json({ error: denied.error }, { status: denied.status });
    }
    const result = await createSale(ready.admin, ready.buId, ready.user.authUid || ready.user.id, body);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    if (result.paymentId) {
      await writeAuditEvent({
        action: "sale.payment_recorded",
        module: "beekeeping",
        description: `Recorded a payment for ${result.data?.sale_code}.`,
        severity: "medium",
        entityType: "bee_sale_payment",
        entityId: result.paymentId,
        businessUnitId: ready.buId,
        metadata: { saleId: result.data?.id },
      });
    }
    await writeAuditEvent({
      action: "stock.allocated",
      module: "beekeeping",
      description: `Allocated ${result.data?.quantity_kg} kg of honey to ${result.data?.sale_code}.`,
      severity: "medium",
      entityType: "bee_sale",
      entityId: result.data?.id,
      businessUnitId: ready.buId,
    });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: "sale.created",
      description: `Recorded honey sale ${result.data?.sale_code}.`,
      entityType: "bee_sale",
      entityId: result.data?.id,
      metadata: { quantity_kg: result.data?.quantity_kg },
    });
  } catch (error) {
    return beeFail(error);
  }
}
