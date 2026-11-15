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

export type DecisionReview = {
  id: string;
  status: string;
  source_decision_id: string;
  created_at: string;
};

export function reviewForDecision<T extends DecisionReview>(
  reviews: T[],
  decisionId: string,
): T | null {
  const matches = reviews.filter((review) => review.source_decision_id === decisionId);
  const open = matches.find((review) => review.status === "approved" || review.status === "pending");
  if (open) {
    return open;
  }
  return matches.sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
}

export function reviewsByDecision<T extends DecisionReview>(reviews: T[]): Record<string, T> {
  const grouped: Record<string, T> = {};
  for (const review of reviews) {
    const current = grouped[review.source_decision_id];
    grouped[review.source_decision_id] = current
      ? reviewForDecision([current, review], review.source_decision_id) ?? review
      : review;
  }
  return grouped;
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
