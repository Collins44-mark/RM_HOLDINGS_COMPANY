import { randomBytes } from "node:crypto";

export function generateTemporaryPassword() {
  return `Rm.${randomBytes(12).toString("base64url")}9A`;
}
