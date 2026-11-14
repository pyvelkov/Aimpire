export function displayEvidenceLabel(status: string | null, label: string): string {
  if (status === "verified") {
    return "Verified";
  }

  if (!label || label === "Verified" || label === "Confirmed") {
    return "Unverified — not confirmed";
  }

  return label;
}

export const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProductId(value: string): boolean {
  return PRODUCT_ID_PATTERN.test(value);
}
