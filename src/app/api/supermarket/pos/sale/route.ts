import { completeSaleAction } from "@/actions/supermarket/sales";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Add a payment." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Add a payment." }, { status: 400 });
  }
  const result = await completeSaleAction(body as Parameters<typeof completeSaleAction>[0]);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
