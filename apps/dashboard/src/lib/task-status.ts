export function displayTaskStatus(status: string, label: string): string {
  if (status === "pending") {
    return "Queued";
  }
  if (status === "in_progress") {
    return "Running";
  }
  if ((label === "Running" || label === "Queued") && status !== "in_progress" && status !== "pending") {
    return label === "Running" ? "Running" : label;
  }
  return label || status;
}

export function agentsPageHref(query: {
  q?: string;
  agent?: string;
  status?: string;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.agent) params.set("agent", query.agent);
  if (query.status) params.set("status", query.status);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/agents?${search}` : "/agents";
}
