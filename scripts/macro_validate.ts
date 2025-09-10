import fs from "node:fs";
import path from "node:path";
import { makeAjv } from "../src/validator/ajv-config.js";

function readJSON(p: string) { 
  return JSON.parse(fs.readFileSync(p, "utf-8")); 
}

const ROOT = process.cwd();
const MACROS = path.join(ROOT, "lexicon/macro_registry.json");

async function main() {
  const reg = readJSON(MACROS);
  const ajv = makeAjv();

  // Load envelope schema and references
  const envelopeSchema = readJSON(path.join(ROOT, "schemas/envelope.3.3.schema.json"));

  try {
    // Load referenced schemas if they exist
    const policiesPath = path.join(ROOT, "schemas/policies.schema.json");
    const vnlPath = path.join(ROOT, "schemas/vnl.schema.json");

    if (fs.existsSync(policiesPath)) {
      const policiesSchema = readJSON(policiesPath);
      ajv.addSchema(policiesSchema);
    }

    if (fs.existsSync(vnlPath)) {
      const vnlSchema = readJSON(vnlPath);
      ajv.addSchema(vnlSchema);
    }

    // Load action schemas
    const actionsDir = path.join(ROOT, "schemas/actions");
    if (fs.existsSync(actionsDir)) {
      for (const file of fs.readdirSync(actionsDir)) {
        if (file.endsWith(".schema.json")) {
          try {
            const actionSchema = readJSON(path.join(actionsDir, file));
            ajv.addSchema(actionSchema);
            console.log(`Loaded action schema: ${file}`);
          } catch (e) {
            console.warn(`Could not load action schema ${file}:`, e);
          }
        }
      }
    }

    // Load lexicon schemas
    const lexiconDir = path.join(ROOT, "schemas/lexicon");
    if (fs.existsSync(lexiconDir)) {
      for (const file of fs.readdirSync(lexiconDir)) {
        if (file.endsWith(".schema.json")) {
          try {
            const lexiconSchema = readJSON(path.join(lexiconDir, file));
            ajv.addSchema(lexiconSchema);
            console.log(`Loaded lexicon schema: ${file}`);
          } catch (e) {
            console.warn(`Could not load lexicon schema ${file}:`, e);
          }
        }
      }
    }
  } catch (e) {
    console.warn("Warning: Could not load some referenced schemas:", e);
  }

  let validate;
  try {
    validate = ajv.compile(envelopeSchema);
    console.log("Successfully compiled envelope schema");
  } catch (e) {
    console.error("Failed to compile envelope schema:", e);
    process.exit(1);
  }

  function replacePlaceholders(obj: any): any {
    if (typeof obj === "string") {
      // Replace placeholders with valid values for validation
      return obj
        .replace(/\$\{CONFIG\.EMAIL_ENDPOINT\}/g, "https://api.example.com/email")
        .replace(/\$\{CONFIG\.API_ENDPOINT\}/g, "https://api.example.com")
        .replace(/\$\{[^}]+\}/g, "placeholder_value");
    }
    if (Array.isArray(obj)) {
      return obj.map(replacePlaceholders);
    }
    if (obj && typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = replacePlaceholders(value);
      }
      return result;
    }
    return obj;
  }

  let errors = 0;
  for (const m of reg.macros ?? []) {
    const render = m.render;
    if (!render?.actions || !Array.isArray(render.actions)) {
      console.warn(`Macro ${m.id} has no actions array, skipping validation`);
      continue;
    }

    let i = 0;
    for (const act of render.actions) {
      // Replace placeholders with valid values for validation
      const processedAction = replacePlaceholders(act);

      const tmp = {
        mova_version: "3.3",
        id: `macro-${m.id}-action-${i}`,
        actions: [processedAction]
      };
      const ok = validate(tmp);
      if (!ok) {
        errors++;
        console.error(`Macro ${m.id} action#${i} invalid:`);
        for (const err of validate.errors || []) {
          console.error(`  - ${err.instancePath}: ${err.message}`);
          if (err.data !== undefined) {
            console.error(`    Data: ${JSON.stringify(err.data)}`);
          }
        }
      }
      i++;
    }
  }

  if (errors) {
    console.error(`macro_validate: FAILED with ${errors} invalid action(s)`);
    process.exit(1);
  }
  console.log("macro_validate: OK");
}

main().catch(err => {
  console.error("macro_validate failed:", err);
  process.exit(1);
});
