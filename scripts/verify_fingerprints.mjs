#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LOCK = "schemas/SCHEMA_FINGERPRINTS.json";
const MANIFEST = "schemas/schema_manifest.json";

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

console.log("🔍 Verifying schema fingerprints...");

if (!fs.existsSync(LOCK)) {
  console.error(`❌ Lock file not found: ${LOCK}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) {
  console.error(`❌ Manifest file not found: ${MANIFEST}`);
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const lockByPath = new Map(lock.entries.map(e => [e.path, e]));

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
  const digest = sha256(stableStringify(json));
  const rec = lockByPath.get(p);
  
  if (!rec) {
    console.error(`❌ Missing lock entry for: ${p}`);
    ok = false;
    continue;
  }
  
  if ((json.$id || id) !== rec.id) {
    console.error(`❌ $id mismatch for: ${p}`);
    console.error(`   expected: ${rec.id}`);
    console.error(`   actual: ${json.$id || id}`);
    ok = false;
  }
  
  if (digest !== rec.sha256) {
    console.error(`❌ Fingerprint mismatch for: ${p}`);
    console.error(`   expected: ${rec.sha256}`);
    console.error(`   actual: ${digest}`);
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

console.log(`✅ All ${checked} schema fingerprints verified successfully`);
