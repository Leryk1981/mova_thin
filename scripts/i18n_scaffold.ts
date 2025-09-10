// scripts/i18n_scaffold.ts
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REG = path.join(ROOT, "lexicon/frame_registry.json");

type Frame = { 
  id: string; 
  langs: Record<string, { phrases: string[] }> 
};

function uniq(a: string[]) { 
  return Array.from(new Set(a.filter(Boolean).map(s => s.trim()))); 
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REG, "utf-8"));
  const frames: Frame[] = registry.frames || [];
  let added = 0;
  
  for (const f of frames) {
    if (!f.langs) f.langs = {};
    
    const en = uniq(f.langs?.en?.phrases || []);
    const uk = uniq(f.langs?.uk?.phrases || []);
    
    // Initialize langs structure if missing
    if (!f.langs.en) f.langs.en = { phrases: [] };
    if (!f.langs.uk) f.langs.uk = { phrases: [] };

    // якщо uk порожні — підставляємо плейсхолдери на базі en
    if (en.length && uk.length === 0) {
      f.langs.uk.phrases = en.map(s => `[TODO uk] ${s}`);
      added += f.langs.uk.phrases.length;
      console.log(`Added ${f.langs.uk.phrases.length} placeholder phrases for frame: ${f.id}`);
    }
  }
  
  if (added) {
    fs.writeFileSync(REG, JSON.stringify(registry, null, 2));
    console.log(`i18n_scaffold: added ${added} uk placeholder phrase(s).`);
  } else {
    console.log("i18n_scaffold: nothing to add.");
  }
}

main();
