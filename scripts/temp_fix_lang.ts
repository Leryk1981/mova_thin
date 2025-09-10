// scripts/temp_fix_lang.ts - Temporary fix to change problematic templates to English
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEMPLATES_REG = path.join(ROOT, "templates/registry.json");
const FRAMES_REG = path.join(ROOT, "lexicon/frame_registry.json");

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

function main() {
  const templatesRegistry = JSON.parse(fs.readFileSync(TEMPLATES_REG, "utf-8"));
  const framesRegistry = JSON.parse(fs.readFileSync(FRAMES_REG, "utf-8"));
  
  const frames = framesRegistry.frames || [];
  const templates = templatesRegistry.templates || [];
  
  let changed = 0;
  
  for (const template of templates) {
    if (template.style !== "vnl" || !template.vnl || template.lang !== "uk") {
      continue;
    }
    
    // Check if template VNL phrase matches Ukrainian frame phrases
    const frameId = findFrameByPhrase(frames, "uk", template.vnl);
    
    if (!frameId) {
      // Check if it matches English frame phrases
      const enFrameId = findFrameByPhrase(frames, "en", template.vnl);
      if (enFrameId) {
        console.log(`Changing template ${template.id} from uk to en (VNL: ${template.vnl})`);
        template.lang = "en";
        changed++;
      }
    }
  }
  
  if (changed > 0) {
    fs.writeFileSync(TEMPLATES_REG, JSON.stringify(templatesRegistry, null, 2));
    console.log(`\nChanged ${changed} templates from uk to en`);
  } else {
    console.log("No templates needed language change");
  }
}

main();
