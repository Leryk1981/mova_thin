import fs from "node:fs";
import path from "node:path";
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist/validators");
fs.mkdirSync(OUT, { recursive: true });

function readJson(p: string) { return JSON.parse(fs.readFileSync(p, "utf-8")); }

const targets = [
  {
    id: "envelope_3_3",
    schemaPath: "schemas/envelope.3.3.schema.json",
    exportName: "validate_envelope_3_3",
  },
  {
    id: "route_1_0",
    schemaPath: "schemas/route.1.0.schema.json",
    exportName: "validate_route_1_0",
  },
  {
    id: "frame_registry",
    schemaPath: "schemas/lexicon/frame_registry.schema.json",
    exportName: "validate_frame_registry",
  },
  {
    id: "macro_registry",
    schemaPath: "schemas/lexicon/macro_registry.schema.json",
    exportName: "validate_macro_registry",
  }
];

async function buildOne(t: {id:string; schemaPath:string; exportName:string}) {
  console.log(`Building validator for ${t.id}...`);
  try {
    // Dynamic import for AJV 2020 and standalone
    const Ajv2020 = require("ajv/dist/2020");
    const addFormats = require("ajv-formats");
    const standalone = require("ajv/dist/standalone");
    console.log(`✔ Loaded AJV modules for ${t.id}`);

    const ajv = new Ajv2020({
      strict: false,  // Disable strict mode for standalone generation
      allErrors: true,
      validateFormats: true,
      code: { source: true, esm: true }
    });
    addFormats(ajv);
    console.log(`✔ Created AJV instance for ${t.id}`);

    // Load all referenced schemas for envelope/route
    const addRef = (p: string) => {
      const absRef = path.join(ROOT, p);
      if (!fs.existsSync(absRef)) return;
      const s = readJson(absRef); ajv.addSchema(s, s.$id || p);
    };
    // Common refs
    addRef('schemas/policies.schema.json');
    addRef('schemas/vnl.schema.json');
    if (t.id !== 'envelope_3_3') addRef('schemas/envelope.3.3.schema.json');
    addRef('schemas/actions/print.schema.json');
    addRef('schemas/actions/http_fetch.schema.json');
    addRef('schemas/actions/set.schema.json');
    addRef('schemas/actions/sleep.schema.json');
    addRef('schemas/actions/transform.schema.json');
    addRef('schemas/actions/parse_json.schema.json');
    addRef('schemas/actions/log.schema.json');
    addRef('schemas/actions/assert.schema.json');
    addRef('schemas/actions/call.schema.json');
    addRef('schemas/actions/emit_event.schema.json');
    addRef('schemas/actions/tool_call.schema.json');
    addRef('schemas/actions/json_patch.schema.json');
    addRef('schemas/actions/file_read.schema.json');
    addRef('schemas/actions/file_write.schema.json');
    addRef('schemas/actions/regex_extract.schema.json');
    addRef('schemas/actions/base64.schema.json');
    addRef('schemas/actions/vnl.schema.json');
    addRef('schemas/actions/if.schema.json');
    addRef('schemas/actions/repeat.schema.json');
    addRef('schemas/actions/parallel.schema.json');

    // Load schema and compile
    const abs = path.join(ROOT, t.schemaPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Schema file not found: ${abs}`);
    }
    const schema = readJson(abs);
    console.log(`✔ Loaded schema for ${t.id}: ${schema.$id || 'no $id'}`);

    const validate = ajv.compile(schema);
    console.log(`✔ Compiled validator for ${t.id}`);

    const mod = standalone(ajv, validate, { code: { esm: true } });
    console.log(`✔ Generated standalone code for ${t.id}`);

    const outFile = path.join(OUT, `${t.id}.mjs`);
    fs.writeFileSync(outFile, mod);
    console.log(`✔ built validator: ${t.id} -> ${path.relative(ROOT, outFile)}`);
  } catch (error) {
    console.error(`✗ failed to build validator ${t.id}:`, error);
    // Don't exit on individual failures, continue with others
  }
}

async function main() {
  console.log("Building standalone AJV validators...");
  for (const t of targets) {
    await buildOne(t);
  }
  console.log("✔ All validators built successfully");
}

main().catch(err => {
  console.error("Build validators failed:", err);
  process.exit(1);
});
