import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const properties = await prisma.property.findMany({ take: 50 });
    return NextResponse.json({ properties });
  } catch {
    return NextResponse.json({ error: "Unauthorized or unavailable" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const property = await prisma.property.create({ data: body });
    return NextResponse.json({ property });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
