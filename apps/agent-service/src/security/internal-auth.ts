import { createHash, timingSafeEqual } from "node:crypto";

export const INTERNAL_API_SECRET_HEADER = "x-aimpire-internal-secret";

export function readHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }

  return null;
}

export function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedHash = createHash("sha256").update(provided, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function hasValidInternalSecret(
  provided: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) {
    return false;
  }

  return secretsMatch(provided, expected);
}
