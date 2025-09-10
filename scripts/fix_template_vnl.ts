// scripts/fix_template_vnl.ts
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEMPLATES_REG = path.join(ROOT, "templates/registry.json");
const FRAMES_REG = path.join(ROOT, "lexicon/frame_registry.json");

function main() {
  const templatesRegistry = JSON.parse(fs.readFileSync(TEMPLATES_REG, "utf-8"));
  const framesRegistry = JSON.parse(fs.readFileSync(FRAMES_REG, "utf-8"));
  
  const frames = framesRegistry.frames || [];
  const templates = templatesRegistry.templates || [];
  
  let fixed = 0;
  
  for (const template of templates) {
    if (template.style !== "vnl" || !template.vnl || template.lang !== "uk") {
      continue;
    }
    
    // Find corresponding frame
    const frame = frames.find((f: any) => f.id === template.id);
    if (!frame || !frame.langs?.uk?.phrases?.length) {
      continue;
    }
    
    // Get the first Ukrainian phrase from frame
    const ukPhrase = frame.langs.uk.phrases[0];
    
    // Check if template VNL starts with Ukrainian phrase
    const templateVnl = template.vnl.toLowerCase();
    const ukPhraseStart = ukPhrase.toLowerCase();
    
    if (!templateVnl.startsWith(ukPhraseStart)) {
      // Try to fix by replacing English start with Ukrainian
      const englishPhrases = frame.langs?.en?.phrases || [];
      let fixed_vnl = template.vnl;
      
      for (const enPhrase of englishPhrases) {
        const enPhraseStart = enPhrase.toLowerCase();
        if (templateVnl.startsWith(enPhraseStart)) {
          // Replace English phrase with Ukrainian phrase
          fixed_vnl = ukPhrase + template.vnl.substring(enPhrase.length);
          break;
        }
      }
      
      if (fixed_vnl !== template.vnl) {
        console.log(`Fixing template ${template.id}:`);
        console.log(`  Old: ${template.vnl}`);
        console.log(`  New: ${fixed_vnl}`);
        template.vnl = fixed_vnl;
        fixed++;
      }
    }
  }
  
  if (fixed > 0) {
    fs.writeFileSync(TEMPLATES_REG, JSON.stringify(templatesRegistry, null, 2));
    console.log(`\nFixed ${fixed} template VNL phrases`);
  } else {
    console.log("No templates needed fixing");
  }
}

main();
