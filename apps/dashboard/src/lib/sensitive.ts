const SENSITIVE_KEY = /secret|password|token|api[_-]?key|service[_-]?role|authorization/i;

function containsSecret(value: string, secrets: string[]): boolean {
  if (value.includes("sb_secret_")) {
    return true;
  }

  return secrets.some((secret) => secret.length >= 16 && value.includes(secret));
}

export function stripSensitive(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") {
    return containsSecret(value, secrets) ? "[redacted]" : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripSensitive(item, secrets));
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        continue;
      }

      cleaned[key] = stripSensitive(child, secrets);
    }

    return cleaned;
  }

  return value;
}
