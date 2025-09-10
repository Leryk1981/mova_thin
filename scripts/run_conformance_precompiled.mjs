#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import * as url from "url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const validators = require("../build/validators/index.cjs"); // the standalone bundle exports default fn(s)

// ajv standalone default export returns a function; to support multiple schemas we use bundler semantics:
// In the generated bundle, each schema compiles to a function available via require(...) semantics.
// We'll try-property access by $id.

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function loadFiles(globDir){
  return fs.readdirSync(globDir).filter(f=>f.endsWith(".json")).map(f=>path.join(globDir,f));
}

// very small formatter
function formatError(errs){
  return {
    error: "ValidationError",
    summary: `${errs.length} error(s)`,
    details: errs.map(e => ({
      path: e.instancePath || e.dataPath || "",
      message: e.message,
      keyword: e.keyword,
      schemaPath: e.schemaPath
    }))
  };
}

function validateDir(validatorKey, dir, expectValid){
  const files = loadFiles(dir);
  let ok = true;
  const validate = validators[validatorKey]; // validatorKey should map to a function
  if (typeof validate !== "function") {
    console.error(`No validator for ${validatorKey}`);
    console.error(`Available validators:`, Object.keys(validators));
    process.exit(2);
  }
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f,"utf-8"));
    const valid = validate(data);
    if (expectValid && !valid) {
      ok = false;
      console.error(`❌ FAIL (should pass): ${f}`);
      console.error(JSON.stringify(formatError(validate.errors || []), null, 2));
    } else if (!expectValid && valid) {
      ok = false;
      console.error(`❌ FAIL (should fail): ${f}`);
    } else {
      console.log(`✅ ${expectValid ? "PASS" : "EXPECTED FAIL"}: ${f}`);
    }
  }
  return ok;
}

// map validator keys from generated bundle
const ENVELOPE_KEY = "envelope_3_3_schema_json";
const ROUTE_KEY    = "route_1_0_schema_json";

let allOk = true;
allOk &= validateDir(ENVELOPE_KEY, "tests/conformance/envelope/positive", true);
allOk &= validateDir(ENVELOPE_KEY, "tests/conformance/envelope/negative", false);
allOk &= validateDir(ROUTE_KEY,    "tests/conformance/route/positive",   true);
allOk &= validateDir(ROUTE_KEY,    "tests/conformance/route/negative",   false);

process.exit(allOk ? 0 : 1);
