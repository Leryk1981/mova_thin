import fs from "node:fs";
import path from "node:path";

type Template = {
  id: string;
  lang?: string;
  style: "vnl" | "envelope";
  params: { name: string; required?: boolean }[];
  vnl?: string;
  envelope?: unknown;
};

// Parse command line arguments
const isStrict = process.argv.includes("--strict");

const ROOT = process.cwd();
const regPath = path.join(ROOT, "templates/registry.json");
const frameRegPath = path.join(ROOT, "lexicon/frame_registry.json");
const schemaPath = path.join(ROOT, "schemas/templates/registry.schema.json");
const frameSchemaPath = path.join(ROOT, "schemas/lexicon/frame_registry.schema.json");

async function loadAjv() {
  const { makeAjv } = await import('../src/validator/ajv-config.js');
  return makeAjv();
}

async function validateEnvelopeActions(ajv: any, actions: any[]): Promise<string[]> {
  const errors: string[] = [];

  // Load envelope schema
  const envelopeSchema = readJSON(path.join(ROOT, "schemas/envelope.3.3.schema.json"));

  // Load referenced schemas
  try {
    const policiesSchema = readJSON(path.join(ROOT, "schemas/policies.schema.json"));
    const vnlSchema = readJSON(path.join(ROOT, "schemas/vnl.schema.json"));
    ajv.addSchema(policiesSchema);
    ajv.addSchema(vnlSchema);

    // Load action schemas
    const actionsDir = path.join(ROOT, "schemas/actions");
    if (fs.existsSync(actionsDir)) {
      for (const file of fs.readdirSync(actionsDir)) {
        if (file.endsWith(".schema.json")) {
          const actionSchema = readJSON(path.join(actionsDir, file));
          ajv.addSchema(actionSchema);
        }
      }
    }
  } catch (e) {
    // Schemas might already be loaded
  }

  const validate = ajv.compile(envelopeSchema);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const tmpEnvelope = {
      mova_version: "3.3",
      id: "lint-test",
      actions: [action]
    };

    const ok = validate(tmpEnvelope);
    if (!ok) {
      const actionErrors = (validate.errors || [])
        .map((err: any) => `${err.instancePath}: ${err.message}`)
        .join(", ");
      errors.push(`action#${i} invalid: ${actionErrors}`);
    }
  }

  return errors;
}

function checkHtmlPlaceholders(obj: any, path: string = ""): string[] {
  const warnings: string[] = [];

  if (typeof obj === "string") {
    const htmlPlaceholders = obj.match(/\$\{html[^}]*\}/g) || [];
    for (const placeholder of htmlPlaceholders) {
      if (!path.includes(".html")) {
        warnings.push(`HTML placeholder ${placeholder} found outside html field at ${path}`);
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      warnings.push(...checkHtmlPlaceholders(item, `${path}[${index}]`));
    });
  } else if (obj && typeof obj === "object") {
    Object.entries(obj).forEach(([key, value]) => {
      const newPath = path ? `${path}.${key}` : key;
      warnings.push(...checkHtmlPlaceholders(value, newPath));
    });
  }

  return warnings;
}

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function extractPlaceholdersFromString(s: string): Set<string> {
  const out = new Set<string>();
  const re = /\$\{([a-zA-Z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.add(m[1]);
  return out;
}

function extractPlaceholders(x: unknown): Set<string> {
  if (typeof x === "string") return extractPlaceholdersFromString(x);
  if (!x || typeof x !== "object") return new Set();
  const s = JSON.stringify(x);
  return extractPlaceholdersFromString(s);
}

function findFrameByPhrase(frames: any[], lang: string, text: string): string | null {
  const lower = text.trim().toLowerCase();
  for (const f of frames) {
    const l = f.langs?.[lang] || f.langs?.en;
    if (!l?.phrases) continue;
    // greedy longest-match: сортуємо фрази за довжиною
    const phrases: string[] = [...l.phrases].sort((a, b) => b.length - a.length);
    for (const phrase of phrases) {
      const p = phrase.toLowerCase();
      if (lower.startsWith(p)) return f.id;
    }
  }
  return null;
}

async function main() {
  const ajv = await loadAjv();
  const templatesReg = readJSON(regPath) as any;
  const framesReg = readJSON(frameRegPath) as any;

  // AJV-валідація реєстрів (страхуємося тут теж)
  const regSchema = readJSON(schemaPath);
  const frameSchema = readJSON(frameSchemaPath);
  const v1 = ajv.compile(regSchema);
  const v2 = ajv.compile(frameSchema);
  if (!v1(templatesReg)) {
    console.error("templates/registry.json is invalid:", v1.errors);
    process.exit(1);
  }
  if (!v2(framesReg)) {
    console.error("lexicon/frame_registry.json is invalid:", v2.errors);
    process.exit(1);
  }

  const frames: any[] = (framesReg as any).frames || [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const t of ((templatesReg as any).templates || []) as Template[]) {
    const paramNames = new Set(t.params?.map(p => p.name) || []);
    let used = new Set<string>();

    if (t.style === "vnl") {
      if (!t.vnl) {
        errors.push(`[${t.id}] style=vnl but "vnl" text missing`);
      } else {
        const lang = t.lang || "en";
        // 1) фаза фрази: має бути у frame_registry
        const frameId = findFrameByPhrase(frames, lang, t.vnl);
        if (!frameId) {
          const msg = `[${t.id}] VNL phrase not found in frame_registry for lang=${lang}`;
          if (isStrict) errors.push(msg);
          else warnings.push(msg);
        }
        // 2) плейсхолдери
        used = extractPlaceholders(t.vnl);
      }
    } else if (t.style === "envelope") {
      used = extractPlaceholders(t.envelope);
      // Перевіримо, що envelope — об'єкт (зазвичай так)
      if (typeof t.envelope !== "object" || t.envelope === null) {
        errors.push(`[${t.id}] style=envelope but "envelope" field is not an object`);
      } else {
        // Validate envelope actions if present
        const env = t.envelope as any;
        if (env.actions && Array.isArray(env.actions)) {
          try {
            const actionErrors = await validateEnvelopeActions(ajv, env.actions);
            for (const err of actionErrors) {
              errors.push(`[${t.id}] ${err}`);
            }
          } catch (e) {
            warnings.push(`[${t.id}] Could not validate envelope actions: ${e}`);
          }
        }

        // Check HTML placeholders
        const htmlWarnings = checkHtmlPlaceholders(t.envelope, `template.${t.id}`);
        for (const warning of htmlWarnings) {
          const msg = `[${t.id}] ${warning}`;
          if (isStrict) errors.push(msg);
          else warnings.push(msg);
        }
      }
    } else {
      errors.push(`[${t.id}] unknown style: ${String((t as any).style)}`);
    }

    // 3) відповідність плейсхолдерів ↔ params
    for (const u of used) {
      if (!paramNames.has(u)) {
        const msg = `[${t.id}] placeholder "\${${u}}" is not declared in params`;
        if (isStrict) errors.push(msg);
        else warnings.push(msg);
      }
    }
    const required = (t.params || []).filter(p => p.required !== false).map(p => p.name);
    for (const r of required) {
      // required має бути використаний хоча б десь
      if (![...used].includes(r)) {
        const msg = `[${t.id}] required param "${r}" not used in template`;
        if (isStrict) errors.push(msg);
        else warnings.push(msg);
      }
    }
  }

  // In strict mode, warnings become errors
  if (isStrict && warnings.length) {
    errors.push(...warnings);
  }

  if (warnings.length && !isStrict) {
    console.warn("Template Lint Warnings:");
    for (const w of warnings) console.warn("  -", w);
  }

  if (errors.length) {
    console.error(isStrict ? "Template Lint Errors (strict mode):" : "Template Lint Errors:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }

  console.log("templates_lint: OK");
}

main().catch(console.error);
