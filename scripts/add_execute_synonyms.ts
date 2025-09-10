// scripts/add_execute_synonyms.ts
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FRAMES_REG = path.join(ROOT, "lexicon/frame_registry.json");

function main() {
  console.log("🔧 Adding 'execute' synonyms to frame_registry");
  
  const framesRegistry = JSON.parse(fs.readFileSync(FRAMES_REG, "utf-8"));
  const frames = framesRegistry.frames || [];
  
  let added = 0;
  
  for (const frame of frames) {
    if (!frame.langs?.uk?.phrases) {
      continue;
    }
    
    const executePhrase = `execute ${frame.id}`;
    const ukPhrases = frame.langs.uk.phrases;
    
    // Check if execute phrase already exists
    if (!ukPhrases.includes(executePhrase)) {
      ukPhrases.push(executePhrase);
      added++;
      console.log(`Added "${executePhrase}" to frame: ${frame.id}`);
    }
  }
  
  if (added > 0) {
    fs.writeFileSync(FRAMES_REG, JSON.stringify(framesRegistry, null, 2));
    console.log(`\n✅ Added ${added} 'execute' synonyms to frame_registry`);
    console.log("💡 Run 'npm run templates:lint' to check results");
  } else {
    console.log("✅ All frames already have 'execute' synonyms");
  }
}

main();
