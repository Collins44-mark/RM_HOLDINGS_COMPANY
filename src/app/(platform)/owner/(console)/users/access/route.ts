import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { getUserCustomization } from "@/lib/data/rbac";

export async function GET(request: Request) {
  await requireOwner();
  const userId = new URL(request.url).searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    return NextResponse.json({ error: "Missing user." }, { status: 400 });
  }
  const data = await getUserCustomization(userId);
  if (!data) {
    return NextResponse.json({ error: "Unable to load access for this user." }, { status: 404 });
  }
  return NextResponse.json(data);
}
