#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const validators = require("../build/validators/index.cjs");

const ENVELOPE_KEY = "envelope_3_3_schema_json";
const ROUTE_KEY = "route_1_0_schema_json";

function checkDir(validatorKey, dir, shouldPass){
  const validate = validators[validatorKey];
  const files = fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>path.join(dir,f));
  const bad=[];
  for (const f of files){
    const data = JSON.parse(fs.readFileSync(f,"utf8"));
    const ok = validate(data);
    if (shouldPass ? !ok : ok) bad.push(f);
  }
  return bad;
}

function main(){
  const mismatches = [
    ...checkDir(ENVELOPE_KEY, "tests/conformance/envelope/positive", true),
    ...checkDir(ROUTE_KEY,    "tests/conformance/route/positive",   true),
    ...checkDir(ENVELOPE_KEY, "tests/conformance/envelope/negative", false),
    ...checkDir(ROUTE_KEY,    "tests/conformance/route/negative",   false),
  ];
  if (mismatches.length){
    console.error("❌ Mismatched fixtures (please fix):");
    for (const m of mismatches) console.error(" -", m);
    process.exit(1);
  } else {
    console.log("✅ All fixtures match their expected outcome.");
  }
}
main();
