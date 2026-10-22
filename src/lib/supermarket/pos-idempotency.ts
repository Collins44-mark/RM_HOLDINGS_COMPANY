export type PosSaleRpcArgs = {
  p_items: unknown;
  p_payments: unknown;
  p_customer_name: string;
  p_discount: number;
  p_tax: number;
  p_notes: string;
  p_request_id?: string;
};

export function buildPosSaleRpcArgs(input: {
  requestId?: string;
  customerName?: string;
  discount?: number;
  notes?: string;
  items: { productId: string; quantity: number; unitPrice?: number; discount?: number; promotionId?: string | null }[];
  payments: { method: string; amount: number; providerId?: string; provider?: string; reference?: string }[];
}): PosSaleRpcArgs {
  const args: PosSaleRpcArgs = {
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount: item.discount ?? 0,
      promotion_id: item.promotionId ?? null,
    })),
    p_payments: input.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      provider_id: payment.providerId,
      provider: payment.provider,
      reference: payment.reference,
    })),
    p_customer_name: input.customerName ?? "Walk-in Customer",
    p_discount: input.discount ?? 0,
    p_tax: 0,
    p_notes: input.notes ?? "",
  };
  if (input.requestId) args.p_request_id = input.requestId;
  return args;
}

export function posIdempotencyRpcMissing(message: string) {
  return /could not find the function|p_request_id|PGRST202|schema cache/i.test(message);
}

/** Never retry a request-id checkout on the 6-arg RPC — that would post a second sale. */
export function posCheckoutFallbackAllowed(hasRequestId: boolean) {
  return !hasRequestId;
}

export function recoverPosUniqueViolation(input: {
  requestId: string | null;
  existingSaleId: string | null;
}) {
  if (!input.requestId) return { recovered: false as const };
  if (!input.existingSaleId) return { recovered: false as const };
  return { recovered: true as const, saleId: input.existingSaleId, duplicate: true };
}
