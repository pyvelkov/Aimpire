import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("dashboard source boundaries", () => {
  it("keeps secrets, signup, publishing, and Phaser out of the app", () => {
    const files = walk(srcRoot).filter((path) => (
      /\.(ts|tsx|css|mjs)$/.test(path) && !path.endsWith(".test.ts")
    ));
    const offenders: string[] = [];

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const relative = path.slice(srcRoot.length).replaceAll("\\", "/");
      const client = source.includes('"use client"') || source.includes("'use client'");

      if (/signUp\s*\(/.test(source) || /supabase\.auth\.signUp/.test(source)) {
        offenders.push(`${relative} enables signup`);
      }

      if (/phaser|shopify|publishProduct|executeNext/i.test(source)) {
        offenders.push(`${relative} includes a later-stage action`);
      }

      if (/SUPABASE_SECRET_KEY|NEXT_PUBLIC_.*SECRET|service_role/.test(source)) {
        offenders.push(`${relative} references the Supabase secret`);
      }

      if (client && /INTERNAL_API_SECRET|SUPABASE_ANON_KEY|SUPABASE_SECRET_KEY/.test(source)) {
        offenders.push(`${relative} is a client module with a server credential`);
      }
    }

    const authSource = readFileSync(join(srcRoot, "actions", "auth.ts"), "utf8");
    assert.match(authSource, /signInWithPassword/);
    assert.doesNotMatch(authSource, /signUp/);
    assert.deepEqual(offenders, []);
  });
});
