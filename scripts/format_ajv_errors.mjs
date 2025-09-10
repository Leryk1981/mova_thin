#!/usr/bin/env node
import fs from "node:fs";

function stdErr(schemaId, errs) {
  return {
    error: "ValidationError",
    schema_id: schemaId,
    summary: `${errs.length} error(s)`,
    details: errs.map(e => ({
      path: e.instancePath || e.dataPath || "",
      message: e.message,
      keyword: e.keyword,
      schemaPath: e.schemaPath
    }))
  };
}

// Reads AJV JSON output from stdin and wraps it.
// Intended for use with npx ajv --errors=json | node scripts/format_ajv_errors.mjs
const buf = fs.readFileSync(0, "utf-8");
let ajvOut;
try { ajvOut = JSON.parse(buf); } catch { ajvOut = null; }
if (!ajvOut || !Array.isArray(ajvOut.errors)) {
  console.log(buf); // passthrough
  process.exit(0);
}
const schemaId = ajvOut.schema || "unknown";
console.log(JSON.stringify(stdErr(schemaId, ajvOut.errors), null, 2));
