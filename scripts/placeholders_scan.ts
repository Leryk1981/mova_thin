// scripts/placeholders_scan.ts
import fs from "node:fs";
import path from "node:path";
import { assertNoPlaceholderKeys } from "../src/utils/safe_substitute.js";

const ROOT = process.cwd();
const TARGETS = [
  "lexicon/macro_registry.json",
  "templates/registry.json",
  "examples/plans",
  "tests"
];

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith(".json")) yield p;
  }
}

function main() {
  let errors = 0;

  for (const t of TARGETS) {
    const p = path.join(ROOT, t);
    if (!fs.existsSync(p)) continue;

    if (fs.statSync(p).isFile()) {
      try {
        const j = readJSON(p);
        assertNoPlaceholderKeys(j, `$:${t}`);
      } catch (e: any) {
        console.error(`ERROR in ${t}: ${e.message}`);
        errors++;
      }
    } else {
      for (const f of walk(p)) {
        try {
          const rel = path.relative(ROOT, f).replace(/\\/g, "/");
          const j = readJSON(f);
          assertNoPlaceholderKeys(j, `$:${rel}`);
        } catch (e: any) {
          console.error(`ERROR in ${f}: ${e.message}`);
          errors++;
        }
      }
    }
  }

  if (errors > 0) {
    console.error(`placeholders_scan: FAILED with ${errors} error(s)`);
    process.exit(1);
  }
  console.log("placeholders_scan: OK");
}

main();
