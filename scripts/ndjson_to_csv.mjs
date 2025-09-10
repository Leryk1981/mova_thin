#!/usr/bin/env node
import fs from "node:fs";

const inPath = process.argv[2] || "build/reports/conformance.ndjson";
const outPath = process.argv[3] || "build/reports/conformance.csv";
const lines = fs.readFileSync(inPath,"utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const header = ['suite','schema_id','file','expected','actual','pass','errors_count'];
const csv = [header.join(',')].concat(
  lines.map(r=>{
    const cols=[r.suite,r.schema_id,r.file,r.expected,r.actual,r.pass?'true':'false',(r.errors||[]).length]
      .map(v=>{ const s=String(v??''); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; });
    return cols.join(',');
  })
).join('\n')+'\n';
fs.writeFileSync(outPath,csv);
console.log(`Wrote ${outPath}`);
