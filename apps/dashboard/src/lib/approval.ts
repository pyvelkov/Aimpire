export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isDashboardOwner(
  email: string | null | undefined,
  ownerEmail: string | null | undefined,
): boolean {
  const owner = normalizeEmail(ownerEmail);

  if (!owner || !owner.includes("@")) {
    return false;
  }

  return normalizeEmail(email) === owner;
}

export function approvalText(approved: boolean, label: string): string {
  if (!approved) {
    return label === "Approved" ? "Not approved" : label || "Not approved";
  }

  return "Approved";
}

export function approvalKpi(approvals: {
  approved_count: number;
  ready_for_review_count: number;
}): { value: string; detail: string } {
  const ready = approvals.ready_for_review_count;
  return {
    value: `${approvals.approved_count} approved`,
    detail: ready > 0
      ? `${ready} ready for review, not counted as approved`
      : "Ready for review is not an approval",
  };
}
