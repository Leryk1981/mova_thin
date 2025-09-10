import fs from "node:fs";
import path from "node:path";
import { substituteStringsOnly, assertNoPlaceholderKeys } from "../src/utils/safe_substitute.js";

const ROOT = process.cwd();
const framesPath = path.join(ROOT, "lexicon/frame_registry.json");
const macroPath = path.join(ROOT, "lexicon/macro_registry.json");

// Use existing makeAjv function
async function loadAjvValidator() {
  const { makeAjv } = await import('../src/validator/ajv-config.js');
  const ajv = makeAjv();

  // Load all schemas
  const envSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas/envelope.3.3.schema.json"), "utf-8"));
  const policiesSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas/policies.schema.json"), "utf-8"));
  const vnlSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas/vnl.schema.json"), "utf-8"));

  // Add all schemas to AJV
  ajv.addSchema(policiesSchema);
  ajv.addSchema(vnlSchema);

  // Load action schemas
  const actionsDir = path.join(ROOT, "schemas/actions");
  const actionFiles = fs.readdirSync(actionsDir).filter(f => f.endsWith('.schema.json'));
  for (const file of actionFiles) {
    const actionSchema = JSON.parse(fs.readFileSync(path.join(actionsDir, file), "utf-8"));
    ajv.addSchema(actionSchema);
  }

  return ajv.compile(envSchema);
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function renderMacroActions(macroRender: any, params: Record<string, any>) {
  // 1) спершу заборони плейсхолдери у ключах
  assertNoPlaceholderKeys(macroRender, "$.macro.render");

  // 2) підстановлюємо ТІЛЬКИ у рядки
  const rendered = substituteStringsOnly(macroRender, params, { onUnknown: "error" });

  // 3) очікуємо структуру { actions: [...] }
  if (!rendered || typeof rendered !== "object" || !Array.isArray((rendered as any).actions)) {
    throw new Error("Macro render must be an object with 'actions' array");
  }
  return (rendered as any).actions;
}

async function main() {
  const validateEnvelope = await loadAjvValidator();
  const frames = JSON.parse(fs.readFileSync(framesPath, "utf-8"));
  const macros = JSON.parse(fs.readFileSync(macroPath, "utf-8"));
  const macroMap = new Map<string, any>(macros.macros.map((m: any) => [m.id, m]));

  const outDir = path.join(ROOT, "examples/plans/generated");
  ensureDir(outDir);

  let ok = 0, skipped = 0, failed = 0;

  for (const f of frames.frames) {
    // збудуємо params з дефолтів/заглушок
    const p: Record<string, any> = {};
    for (const prm of f.params || []) {
      if (typeof prm.default !== "undefined") p[prm.name] = prm.default;
      else {
        // заглушки за типом
        if (prm.type === "string") p[prm.name] = prm.required === false ? "" : `_${prm.name}_`;
        else if (prm.type === "integer" || prm.type === "number") p[prm.name] = 1;
        else if (prm.type === "boolean") p[prm.name] = true;
        else p[prm.name] = `_${prm.name}_`;
      }
    }
    const macroId = f.macro;
    const m = macroMap.get(macroId);
    if (!m?.render) { skipped++; continue; }

    const actions = renderMacroActions(m.render, p);
    const envelope = { mova_version: "3.3", actions };
    const valid = validateEnvelope(envelope);
    const outFile = path.join(outDir, `${f.id}.json`);

    if (!valid) {
      failed++;
      // усе одно збережемо — корисно в дебазі
      fs.writeFileSync(outFile, JSON.stringify(envelope, null, 2));
      console.error(`Invalid generated plan for frame "${f.id}":`, validateEnvelope.errors);
      continue;
    }
    ok++;
    fs.writeFileSync(outFile, JSON.stringify(envelope, null, 2));
  }

  console.log(`vnl_gen_cases: OK=${ok} SKIPPED=${skipped} FAILED=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(console.error);
