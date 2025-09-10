#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";

const MANIFEST = process.env.SCHEMA_MANIFEST || "schemas/schema_manifest.json";
const OUT_DIR = process.env.OUT_DIR || "build/validators";
const INDEX_FILE = path.join(OUT_DIR, "index.cjs");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf-8"));
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  code: {source: true, esm: false}
});
addFormats(ajv);

// Load vnl.schema.json first
const vnlSchemaPath = "schemas/vnl.schema.json";
if (fs.existsSync(vnlSchemaPath)) {
  const vnlSchema = JSON.parse(fs.readFileSync(vnlSchemaPath, "utf-8"));
  if (vnlSchema.$id) {
    ajv.addSchema(vnlSchema);
  }
}

// Load all action schemas
const actionsDir = "schemas/actions";
if (fs.existsSync(actionsDir)) {
  const actionFiles = fs.readdirSync(actionsDir).filter(f => f.endsWith('.schema.json'));
  for (const actionFile of actionFiles) {
    const actionPath = path.join(actionsDir, actionFile);
    const actionSchema = JSON.parse(fs.readFileSync(actionPath, "utf-8"));
    if (actionSchema.$id) {
      ajv.addSchema(actionSchema);
    }
  }
}

const validators = [];
for (const {path: p, id} of manifest.schemas) {
  const schemaPath = path.resolve("schemas", p);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  if (!schema.$id && id) schema.$id = id; // ensure schema id
  ajv.addSchema(schema);
  validators.push({ id: schema.$id || id, key: path.basename(p).replace(/\W+/g,"_") });
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Create a mapping object for named exports
const validatorMap = {};
for (const v of validators) {
  validatorMap[v.key] = v.id;
}

const moduleCode = standaloneCode(ajv, validatorMap);
// write the generated validators bundle
fs.writeFileSync(INDEX_FILE, moduleCode);

// helper map file to export named validators
let exportMap = "/* auto-generated map */\n";
exportMap += "export { default as validators } from './index.js';\n";
fs.writeFileSync(path.join(OUT_DIR, "README.md"),
`# Precompiled AJV validators\nBuilt from ${MANIFEST} on ${new Date().toISOString()}\n`);

console.log(`Validators generated at ${INDEX_FILE}`);
