#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

console.log("🚀 Packing MOVA Thin Core release...");

const REL = "release/mova-thin-core";

// Clean and create directories
console.log("📁 Creating release directory structure...");
fs.rmSync(REL, { recursive: true, force: true });
fs.mkdirSync(`${REL}/validators`, { recursive: true });
fs.mkdirSync(`${REL}/schemas`, { recursive: true });
fs.mkdirSync(`${REL}/templates/canonical`, { recursive: true });
fs.mkdirSync(`${REL}/bin`, { recursive: true });
fs.mkdirSync(`${REL}/scripts`, { recursive: true });

// Copy validators
console.log("📦 Copying precompiled validators...");
if (!fs.existsSync("build/validators/index.cjs")) {
  console.error("❌ build/validators/index.cjs not found. Run 'npm run build:validators' first.");
  process.exit(1);
}
fs.copyFileSync("build/validators/index.cjs", `${REL}/validators/index.cjs`);

// Create ESM shim
console.log("📦 Creating ESM shim...");
const esmShim = `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cjs = require("./index.cjs");
export default cjs;`;
fs.writeFileSync(`${REL}/validators/index.mjs`, esmShim);

// Copy schemas + manifest + lock
console.log("📋 Copying schemas and fingerprints...");
const schemaFiles = [
  "schemas/schema_manifest.json",
  "schemas/SCHEMA_FINGERPRINTS.json", 
  "schemas/envelope.3.3.schema.json",
  "schemas/route.1.0.schema.json",
  "schemas/policies.schema.json"
];

for (const f of schemaFiles) {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, `${REL}/${f}`);
    console.log(`✔ ${f}`);
  } else {
    console.warn(`⚠️ ${f} not found, skipping`);
  }
}

// Copy actions directory if referenced
if (fs.existsSync("schemas/actions")) {
  console.log("📋 Copying action schemas...");
  fs.cpSync("schemas/actions", `${REL}/schemas/actions`, { recursive: true });
}

// Copy canonical templates
console.log("📄 Copying canonical templates...");
if (fs.existsSync("templates/canonical")) {
  fs.cpSync("templates/canonical", `${REL}/templates/canonical`, { recursive: true });
} else {
  console.warn("⚠️ templates/canonical not found, skipping");
}

// Copy LICENSE
if (fs.existsSync("LICENSE")) {
  fs.copyFileSync("LICENSE", `${REL}/LICENSE`);
} else {
  console.log("📄 Creating MIT LICENSE...");
  const license = `MIT License

Copyright (c) 2024 MOVA

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
  fs.writeFileSync(`${REL}/LICENSE`, license);
}

// Create bin script
console.log("🔧 Creating CLI binary...");
fs.copyFileSync("release_templates/bin_mova_validate.cjs", `${REL}/bin/mova-validate.cjs`);

// Create verify script
console.log("🔧 Creating verify script...");
fs.copyFileSync("release_templates/verify_fingerprints.mjs", `${REL}/scripts/verify_fingerprints.mjs`);

// Create package.json
console.log("📄 Creating package.json...");
fs.copyFileSync("release_templates/package.json", `${REL}/package.json`);

// Create README.md
console.log("📄 Creating README.md...");
fs.copyFileSync("release_templates/README.md", `${REL}/README.md`);

console.log("✅ Release directory assembled:", REL);
console.log("📦 Run 'cd release && npm pack ./mova-thin-core' to create tarball");
