import { hash, compare } from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(password: string) {
  return hash(password, ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
