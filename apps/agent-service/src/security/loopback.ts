const LOOPBACK_IPS = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

export function isLoopbackAddress(
  ip: string | undefined | null,
): boolean {
  return typeof ip === "string" && LOOPBACK_IPS.has(ip);
}

export function isLoopbackHost(host: string): boolean {
  return (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]"
  );
}
