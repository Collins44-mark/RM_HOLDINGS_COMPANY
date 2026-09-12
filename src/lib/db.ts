import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  appDatabaseAvailable?: boolean;
};

export function isAppDatabaseAvailable() {
  if (globalForPrisma.appDatabaseAvailable !== undefined) {
    return globalForPrisma.appDatabaseAvailable;
  }
  if (process.env.VERCEL) {
    globalForPrisma.appDatabaseAvailable = false;
    return false;
  }

  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    globalForPrisma.appDatabaseAvailable = false;
    return false;
  }
  if (!url.startsWith("file:")) {
    globalForPrisma.appDatabaseAvailable = true;
    return true;
  }

  const relative = url.slice("file:".length);
  const available = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), relative),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "prisma", relative),
  ].some((file) => existsSync(file));
  globalForPrisma.appDatabaseAvailable = available;
  return available;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
