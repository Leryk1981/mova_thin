#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MANIFEST = process.env.SCHEMA_MANIFEST || "schemas/schema_manifest.json";
const OUT = process.env.OUT || "schemas/SCHEMA_FINGERPRINTS.json";

// Стабільна серіалізація (відсортовані ключі)
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

console.log("🔍 Generating schema fingerprints...");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entries = [];

for (const { path: p, id } of manifest.schemas) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    console.error(`❌ Schema file not found: ${abs}`);
    process.exit(1);
  }
  
  const raw = fs.readFileSync(abs, "utf8");
  const json = JSON.parse(raw);
  const canonical = stableStringify(json);
  const digest = sha256(canonical);
  
  entries.push({
    id: json.$id || id || null,
    path: p,
    bytes: Buffer.byteLength(raw, "utf8"),
    sha256: digest
  });
  
  console.log(`✔ ${p} -> ${digest.substring(0, 12)}...`);
}

const payload = {
  generated_at: new Date().toISOString(),
  manifest: MANIFEST,
  entries
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`✅ Wrote ${OUT} with ${entries.length} entries`);
