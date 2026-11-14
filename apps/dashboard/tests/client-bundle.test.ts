import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const staticRoot = join(appRoot, ".next", "static");

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readEnvValue(filePath: string, name: string): string {
  if (!existsSync(filePath)) {
    return "";
  }

  for (const line of readFileSync(filePath, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith(`${name}=`)) {
      continue;
    }

    return trimmed.slice(name.length + 1).trim();
  }

  return "";
}

describe("client bundle secrets", () => {
  it("does not ship server credentials in the browser bundle", () => {
    assert.equal(existsSync(staticRoot), true, "Run the dashboard build before this check");
    const files = walk(staticRoot).filter((path) => /\.(js|css|json|html|txt)$/.test(path));
    const secret = readEnvValue(join(appRoot, ".env.local"), "INTERNAL_API_SECRET");
    const serviceRole = readEnvValue(
      join(appRoot, "..", "agent-service", ".env"),
      "SUPABASE_SECRET_KEY",
    );
    const needles = ["SUPABASE_SECRET_KEY", "INTERNAL_API_SECRET", "sb_secret_", secret, serviceRole]
      .filter((value) => value.length >= 8);

    const hits: string[] = [];

    for (const path of files) {
      const source = readFileSync(path, "utf8");

      for (const needle of needles) {
        if (source.includes(needle)) {
          hits.push(`${path.slice(staticRoot.length)} contains a server credential marker`);
          break;
        }
      }
    }

    assert.deepEqual(hits, []);
  });
});
