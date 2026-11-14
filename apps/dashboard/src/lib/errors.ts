export class DashboardAccessError extends Error {
  readonly status: 401 | 403 | 503;

  constructor(status: 401 | 403 | 503, message: string) {
    super(message);
    this.name = "DashboardAccessError";
    this.status = status;
  }
}

export class DashboardUpstreamError extends Error {
  readonly status = 502;

  constructor(message = "Dashboard data is unavailable") {
    super(message);
    this.name = "DashboardUpstreamError";
  }
}
