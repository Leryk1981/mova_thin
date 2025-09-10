// scripts/schema_fingerprint.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type FPItem = { file: string; id?: string; version?: string; hash: string };
type FPStore = { generated_at: string; items: Record<string, FPItem> };

const ROOT = process.cwd();
const SCHEMAS_DIR = path.join(ROOT, "schemas");
const FP_FILE = path.join(SCHEMAS_DIR, "_fingerprints.json");
const CHANGELOG = path.join(ROOT, "docs/SCHEMA_CHANGELOG.md");

const args = new Set(process.argv.slice(2));
const MODE_WRITE = args.has("--write");
const MODE_CHECK = args.has("--check") || !MODE_WRITE;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

function sha256(json: unknown): string {
  const s = JSON.stringify(json, Object.keys(json as any).sort());
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function parseVersionFromId(id?: string): string | undefined {
  if (!id) return;
  const m = id.match(/(\d+\.\d+\.\d+)/);
  return m?.[1];
}

function cmpSemver(a?: string, b?: string): number {
  const A = (a ?? "0.0.0").split(".").map(n => parseInt(n, 10));
  const B = (b ?? "0.0.0").split(".").map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function loadFP(): FPStore {
  if (!fs.existsSync(FP_FILE)) {
    return { generated_at: new Date().toISOString(), items: {} };
  }
  return readJSON(FP_FILE);
}

function saveFP(store: FPStore) {
  store.generated_at = new Date().toISOString();
  fs.writeFileSync(FP_FILE, JSON.stringify(store, null, 2));
}

function computeAll(): Record<string, FPItem> {
  const files = walk(SCHEMAS_DIR).filter(f => !f.endsWith("/_fingerprints.json"));
  const items: Record<string, FPItem> = {};
  for (const file of files) {
    try {
      const json = readJSON(file);
      const id = json.$id as string | undefined;
      const version = parseVersionFromId(id) || (typeof json.version === "string" ? json.version : undefined);
      const hash = sha256(json);
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      items[rel] = { file: rel, id, version, hash };
    } catch (e) {
      // Якщо це не валідний JSON — хай упаде на іншому етапі CI.
    }
  }
  return items;
}

function changelogHas(idOrFile: string): boolean {
  if (!fs.existsSync(CHANGELOG)) return false;
  const txt = fs.readFileSync(CHANGELOG, "utf-8");
  return txt.includes(idOrFile);
}

function main() {
  const current = loadFP();
  const nextItems = computeAll();

  if (MODE_WRITE) {
    saveFP({ ...current, items: nextItems });
    console.log(`schema_fingerprint: wrote ${Object.keys(nextItems).length} items`);
    process.exit(0);
  }

  // CHECK mode
  let ok = true;
  const problems: string[] = [];
  const prev = current.items || {};

  for (const [file, it] of Object.entries(nextItems)) {
    // Skip fingerprints file and files without $id (not real schemas)
    if (file.endsWith("/_fingerprints.json") || !it.id) continue;

    const was = prev[file];
    if (!was) continue; // новий файл — ок
    if (was.hash !== it.hash) {
      // зміст змінився → вимагай bump версії та запис у changelog
      const cmp = cmpSemver(it.version, was.version);
      if (cmp <= 0) {
        ok = false;
        problems.push(`Schema changed but version not bumped: ${file} (id:${it.id ?? "n/a"} prev:${was.version ?? "n/a"} -> now:${it.version ?? "n/a"})`);
      }
      if (!changelogHas(it.id || file)) {
        ok = false;
        problems.push(`Schema changed but CHANGELOG missing entry: ${it.id || file} (docs/SCHEMA_CHANGELOG.md)`);
      }
    }
  }

  if (!ok) {
    console.error("Schema Governance check FAILED:");
    for (const p of problems) console.error(" -", p);
    console.error("\nFix:\n  1) bump version in $id (e.g. .../x.y.z/...)\n  2) add entry to docs/SCHEMA_CHANGELOG.md\n  3) run: npm run schema:fp:gen\n");
    process.exit(1);
  }

  console.log("schema_fingerprint: OK");
}

main();
