import { isLoopbackHost } from "./loopback.js";

export function resolveListenHost(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.HOST?.trim() || "127.0.0.1";
  const host = configured === "localhost" ? "127.0.0.1" : configured;

  if (!isLoopbackHost(host) && env.ALLOW_NON_LOOPBACK_BIND !== "true") {
    throw new Error(
      "Refusing to bind the agent service outside localhost. Operational endpoints must stay private.",
    );
  }

  return host;
}
