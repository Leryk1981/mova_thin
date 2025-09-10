#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const validators = require("../build/validators/index.cjs"); // precompiled

const OUT_DIR = "build/reports";
const OUT_NDJSON = path.join(OUT_DIR, "conformance.ndjson");
const SUM_JSON = path.join(OUT_DIR, "summary.json");

const ENVELOPE_KEY = "envelope_3_3_schema_json";
const ROUTE_KEY = "route_1_0_schema_json";

function list(dir){ return fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>path.join(dir,f)); }
function ensureDir(d){ fs.mkdirSync(d, {recursive:true}); }
function resultLine({suite,schema_id,file,expected,actual,errors}){
  return JSON.stringify({
    ts: new Date().toISOString(),
    suite, schema_id, file, expected, actual,
    pass: expected === actual,
    errors_count: errors?.length || 0,
    errors: (errors||[]).map(e=>({
      path: e.instancePath || e.dataPath || "",
      message: e.message, keyword: e.keyword, schemaPath: e.schemaPath
    }))
  }) + "\n";
}

function runSuite(validatorKey, dir, expectedValid){
  const validate = validators[validatorKey];
  if (typeof validate !== "function") throw new Error(`No validator for ${validatorKey}`);
  const files = list(dir);
  let passCount=0, total=0, lines="";
  for (const f of files){
    total++;
    const data = JSON.parse(fs.readFileSync(f,"utf8"));
    const ok = validate(data);
    const actual = ok ? "pass":"fail";
    if ((expectedValid && ok) || (!expectedValid && !ok)) passCount++;
    lines += resultLine({
      suite: dir, schema_id: validatorKey, file: f,
      expected: expectedValid ? "pass":"fail",
      actual, errors: validate.errors||[]
    });
  }
  return {total, passCount, lines};
}

function main(){
  ensureDir(OUT_DIR);
  let nd="";
  const parts = [
    runSuite(ENVELOPE_KEY, "tests/conformance/envelope/positive", true),
    runSuite(ENVELOPE_KEY, "tests/conformance/envelope/negative", false),
    runSuite(ROUTE_KEY, "tests/conformance/route/positive", true),
    runSuite(ROUTE_KEY, "tests/conformance/route/negative", false),
  ];
  for (const p of parts) nd += p.lines;
  fs.writeFileSync(OUT_NDJSON, nd);

  const summary = {
    generated_at: new Date().toISOString(),
    suites: parts.map((p,i)=>({
      name: ["env+/+","env-/-","route+/+","route-/-"][i],
      total: p.total, passed: p.passCount, failed: p.total - p.passCount
    }))
  };
  fs.writeFileSync(SUM_JSON, JSON.stringify(summary,null,2));
  console.log(`NDJSON: ${OUT_NDJSON}`);
  console.log(`Summary: ${SUM_JSON}`);
}
main();
