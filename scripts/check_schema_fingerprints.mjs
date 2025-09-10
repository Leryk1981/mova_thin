#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MANIFEST = process.env.SCHEMA_MANIFEST || "schemas/schema_manifest.json";
const LOCK = process.env.LOCK || "schemas/SCHEMA_FINGERPRINTS.json";

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

console.log("🔍 Checking schema fingerprints...");

if (!fs.existsSync(LOCK)) {
  console.error(`❌ Lock file not found: ${LOCK}`);
  console.error("Run 'npm run schema:hash' to generate fingerprints");
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

const lockMap = new Map(lock.entries.map(e => [e.path, e]));

let ok = true;
let checked = 0;

for (const { path: p, id } of manifest.schemas) {
  if (!fs.existsSync(p)) {
    console.error(`❌ Schema file not found: ${p}`);
    ok = false;
    continue;
  }
  
  const raw = fs.readFileSync(p, "utf8");
  const json = JSON.parse(raw);
  const canonical = stableStringify(json);
  const digest = sha256(canonical);

  const locked = lockMap.get(p);
  if (!locked) {
    console.error(`❌ Missing in lock: ${p}`);
    console.error("   Run 'npm run schema:freeze' to update fingerprints");
    ok = false;
    continue;
  }
  
  if ((json.$id || id || null) !== locked.id) {
    console.error(`❌ $id mismatch for ${p}`);
    console.error(`   actual: ${json.$id || id}`);
    console.error(`   locked: ${locked.id}`);
    ok = false;
  }
  
  if (digest !== locked.sha256) {
    console.error(`❌ SHA-256 mismatch for ${p}`);
    console.error(`   actual: ${digest}`);
    console.error(`   locked: ${locked.sha256}`);
    console.error("   Schema has been modified! Run 'npm run schema:freeze' if intentional");
    ok = false;
  } else {
    console.log(`✔ ${p} -> ${digest.substring(0, 12)}...`);
  }
  
  checked++;
}

if (!ok) {
  console.error(`\n💥 ${checked} schemas checked, some fingerprints don't match!`);
  process.exit(1);
}

console.log(`✅ All ${checked} schemas match their fingerprints`);
