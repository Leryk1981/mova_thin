#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const validators = require("../validators/index.cjs");

const usage = `
mova-validate <type> <file>
  <type>: envelope | route
  <file>: path to JSON file

Examples:
  mova-validate envelope ./templates/canonical/envelope_min.json
  mova-validate route ./templates/canonical/route_min_http_plan_ref.json
`;

const ENVELOPE_ID = "envelope_3_3_schema_json";
const ROUTE_ID = "route_1_0_schema_json";

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (error) {
    console.error(`❌ Failed to load JSON from ${p}:`, error.message);
    process.exit(1);
  }
}

function formatErrors(schemaId, errs) {
  const schemaUrl = schemaId === "envelope_3_3_schema_json" ? "https://mova.dev/schemas/envelope.3.3.schema.json" :
                    schemaId === "route_1_0_schema_json" ? "https://mova.dev/schemas/route.1.0.schema.json" :
                    schemaId;
  return {
    error: "ValidationError",
    schema_id: schemaUrl,
    summary: `${(errs || []).length} error(s)`,
    details: (errs || []).map(e => ({
      path: e.instancePath || e.dataPath || "",
      message: e.message,
      keyword: e.keyword,
      schemaPath: e.schemaPath
    }))
  };
}

function main() {
  const [, , type, file] = process.argv;
  
  if (!type || !file) {
    console.error(usage);
    process.exit(2);
  }
  
  const schemaId = type === "envelope" ? ENVELOPE_ID :
                   type === "route" ? ROUTE_ID : null;
                   
  if (!schemaId) {
    console.error("❌ Unknown type:", type);
    console.error("Supported types: envelope, route");
    process.exit(2);
  }

  const validate = validators[schemaId];
  if (typeof validate !== "function") {
    console.error("❌ Validator for schema not found:", schemaId);
    console.error("Available validators:", Object.keys(validators));
    process.exit(2);
  }

  if (!fs.existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }

  const data = loadJson(path.resolve(file));
  const ok = validate(data);
  
  if (ok) {
    console.log("✅ VALID");
    process.exit(0);
  } else {
    console.error(JSON.stringify(formatErrors(schemaId, validate.errors), null, 2));
    process.exit(1);
  }
}

main();
