#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const LEX_PATH = process.env.LEX_PATH || "vnl/lexicon.en.json";
const OUT_PATH = process.env.OUT_PATH || "templates/NORMALIZATION_TABLE.csv";

const lex = JSON.parse(fs.readFileSync(LEX_PATH, "utf-8"));
const rows = [];
rows.push("source_term,canonical_key,scope,examples,notes,status");

function push(term, canon, scope="*", examples="", notes="", status="stable"){
  // escape quotes for CSV
  const esc = v => (""+v).includes(",") || (""+v).includes("\"")
    ? `"${(""+v).replaceAll("\"","\"\"")}"`
    : v;
  rows.push([term, canon, scope, examples, notes, status].map(esc).join(","));
}

// canon_map: { canonical_key: [synonym1, synonym2, ...] }
const cmap = lex?.canon_map || {};
for (const [canonical, syns] of Object.entries(cmap)) {
  for (const s of syns) push(s, canonical, lex?.scope_map?.[canonical] || "*", "", "from lexicon", "stable");
}

// (optional) log level aliases
if (lex?.log_levels?.aliases) {
  for (const [alias, level] of Object.entries(lex.log_levels.aliases)) {
    push(alias, level, "log_level", "", "log level alias", "stable");
  }
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, rows.join("\n") + "\n");
console.log(`Wrote ${OUT_PATH} with ${rows.length-1} rows.`);
