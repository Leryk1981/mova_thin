#!/usr/bin/env node
import fs from "fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

console.log("🔥 Running smoke tests...");

// Load precompiled validators
let validators;
try {
  validators = require("../build/validators/index.cjs");
} catch (error) {
  console.log("❌ Precompiled validators not found. Run 'npm run build:validators' first.");
  console.log("Error:", error.message);
  process.exit(1);
}

const tests = [
  {
    name: "Envelope (minimal)",
    file: "templates/canonical/envelope_min.json",
    validator: "envelope_3_3_schema_json"
  },
  {
    name: "Route (minimal HTTP + plan_ref)",
    file: "templates/canonical/route_min_http_plan_ref.json",
    validator: "route_1_0_schema_json"
  },
  {
    name: "Route (inline plan)",
    file: "templates/canonical/route_inline_plan.json",
    validator: "route_1_0_schema_json"
  }
];

let allPassed = true;

for (const test of tests) {
  try {
    // Check if file exists
    if (!fs.existsSync(test.file)) {
      console.log(`❌ ${test.name}: File ${test.file} not found`);
      allPassed = false;
      continue;
    }

    const data = JSON.parse(fs.readFileSync(test.file, "utf8"));
    const validator = validators[test.validator];

    if (!validator) {
      console.log(`❌ ${test.name}: Validator ${test.validator} not found`);
      console.log("Available validators:", Object.keys(validators));
      allPassed = false;
      continue;
    }

    const valid = validator(data);
    if (valid) {
      console.log(`✅ ${test.name}: PASS`);
    } else {
      console.log(`❌ ${test.name}: FAIL`);
      if (validator.errors) {
        validator.errors.slice(0, 3).forEach(err => {
          console.log(`   - ${err.instancePath || '/'}: ${err.message}`);
        });
      }
      allPassed = false;
    }
  } catch (error) {
    console.log(`❌ ${test.name}: ERROR - ${error.message}`);
    allPassed = false;
  }
}

if (allPassed) {
  console.log("\n🎉 All smoke tests passed!");
  process.exit(0);
} else {
  console.log("\n💥 Some smoke tests failed!");
  process.exit(1);
}
