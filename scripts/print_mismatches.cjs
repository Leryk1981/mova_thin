#!/usr/bin/env node
const fs = require("fs");
const p = "build/reports/conformance.ndjson";
const lines = fs.readFileSync(p,"utf8").trim().split(/\r?\n/).map(JSON.parse);
const bad = lines.filter(r => (r.expected==="pass" && r.actual==="fail") || (r.expected==="fail" && r.actual==="pass"));
for (const r of bad) {
  console.log(`${r.expected.toUpperCase()} -> ${r.actual.toUpperCase()} | ${r.file}`);
  (r.errors||[]).slice(0,3).forEach(e=>console.log(`  - ${e.path} ${e.message} [${e.keyword}]`));
}
