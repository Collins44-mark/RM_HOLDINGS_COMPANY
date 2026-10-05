import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { getRolePermissionState } from "@/lib/data/rbac";

export async function GET(request: Request) {
  await requireOwner();
  const roleId = new URL(request.url).searchParams.get("roleId")?.trim() ?? "";
  if (!roleId) {
    return NextResponse.json({ error: "Missing role." }, { status: 400 });
  }
  const data = await getRolePermissionState(roleId);
  if (!data) {
    return NextResponse.json({ error: "Unable to load role permissions." }, { status: 404 });
  }
  return NextResponse.json(data);
}
