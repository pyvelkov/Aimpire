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

export class DashboardNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Record not found") {
    super(message);
    this.name = "DashboardNotFoundError";
  }
}

export class DashboardWorkflowError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;

  constructor(status: 400 | 403 | 404 | 409 | 503, message: string) {
    super(message);
    this.name = "DashboardWorkflowError";
    this.status = status;
  }
}
