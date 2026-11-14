import type { FastifyInstance } from "fastify";
import {
  hasValidInternalSecret,
  INTERNAL_API_SECRET_HEADER,
  readHeaderValue,
} from "./internal-auth.js";
import { isLoopbackAddress } from "./loopback.js";

export type PrivateAccessOptions = {
  secret?: string | undefined;
};

function requestPath(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function registerPrivateAccess(
  app: FastifyInstance,
  options: PrivateAccessOptions = {},
): void {
  app.addHook("onRequest", async (request, reply) => {
    const path = requestPath(request.url);

    if (path === "/health") {
      return;
    }

    if (path === "/dashboard" || path.startsWith("/dashboard/")) {
      const expected = options.secret ?? process.env.INTERNAL_API_SECRET;
      const provided = readHeaderValue(
        request.headers[INTERNAL_API_SECRET_HEADER],
      );

      if (!hasValidInternalSecret(provided, expected)) {
        return reply.status(401).send({
          success: false,
          error: "Unauthorized",
        });
      }

      return;
    }

    if (!isLoopbackAddress(request.ip)) {
      return reply.status(403).send({
        success: false,
        error: "This endpoint is available only from localhost",
      });
    }
  });
}
