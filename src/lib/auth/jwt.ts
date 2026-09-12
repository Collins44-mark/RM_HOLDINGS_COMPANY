import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/config/app";

export type SessionClaims = {
  sub: string;
  sid: string;
  email: string;
  name: string;
  title: string;
  role: string;
  roleName: string;
  modules: string[];
  permissions: string[];
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims) {
  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      sid: payload.sid,
      email: payload.email,
      name: payload.name,
      title: typeof payload.title === "string" ? payload.title : "",
      role: payload.role,
      roleName: typeof payload.roleName === "string" ? payload.roleName : payload.role,
      modules: Array.isArray(payload.modules)
        ? payload.modules.filter((item): item is string => typeof item === "string")
        : [],
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export const cookieName = AUTH_COOKIE_NAME;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
