export const PHONE_LOGIN_DOMAIN = "users.rmholdings.internal";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

export function isPhoneIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 9;
}

export function syntheticEmailForPhone(phone: string) {
  return `p${phone}@${PHONE_LOGIN_DOMAIN}`;
}

export function isSyntheticEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${PHONE_LOGIN_DOMAIN}`));
}

export function displayLoginIdentifier(input: { email: string | null; phone: string | null }) {
  if (input.phone && isSyntheticEmail(input.email)) return input.phone;
  return input.email || input.phone || "";
}
