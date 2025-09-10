// scripts/templates_auto_align.ts
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEMPLATES_REG = path.join(ROOT, "templates/registry.json");
const FRAMES_REG = path.join(ROOT, "lexicon/frame_registry.json");

// Parse command line arguments
const isFlipLangFirst = process.argv.includes("--flip-lang-first");
const isRewritePhrase = process.argv.includes("--rewrite-phrase");

type Frame = {
  id: string;
  langs: Record<string, { phrases: string[] }>;
};

type Template = {
  id: string;
  lang: string;
  vnl: string;
  [key: string]: any;
};

class PhraseTrie {
  private frames: Frame[];
  private lang: string;
  
  constructor(frames: Frame[], lang: string) {
    this.frames = frames;
    this.lang = lang;
  }
  
  findLongestMatch(text: string): { frameId: string; phrase: string } | null {
    const lower = text.trim().toLowerCase();
    let bestMatch: { frameId: string; phrase: string } | null = null;
    let bestLength = 0;
    
    for (const frame of this.frames) {
      const phrases = frame.langs?.[this.lang]?.phrases || [];
      for (const phrase of phrases) {
        const p = phrase.toLowerCase();
        if (lower.startsWith(p) && p.length > bestLength) {
          bestMatch = { frameId: frame.id, phrase };
          bestLength = p.length;
        }
      }
    }
    
    return bestMatch;
  }
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\$\{([^}]+)\}/g) || [];
  return matches.map(m => m.slice(2, -1)); // Remove ${ and }
}

function main() {
  console.log("🔧 Templates Auto-Alignment Tool");
  console.log(`Mode: ${isFlipLangFirst ? '--flip-lang-first' : isRewritePhrase ? '--rewrite-phrase' : 'analysis'}`);
  
  const templatesRegistry = JSON.parse(fs.readFileSync(TEMPLATES_REG, "utf-8"));
  const framesRegistry = JSON.parse(fs.readFileSync(FRAMES_REG, "utf-8"));
  
  const frames: Frame[] = framesRegistry.frames || [];
  const templates: Template[] = templatesRegistry.templates || [];
  
  const enTrie = new PhraseTrie(frames, "en");
  const ukTrie = new PhraseTrie(frames, "uk");
  
  let changes = 0;
  let flipped = 0;
  let rewritten = 0;
  
  for (const template of templates) {
    if (template.style !== "vnl" || !template.vnl) {
      continue;
    }
    
    const currentLang = template.lang || "en";
    const currentTrie = currentLang === "uk" ? ukTrie : enTrie;
    const otherTrie = currentLang === "uk" ? enTrie : ukTrie;
    const otherLang = currentLang === "uk" ? "en" : "uk";
    
    // Check if current phrase matches in current language
    const currentMatch = currentTrie.findLongestMatch(template.vnl);
    
    if (currentMatch) {
      // Already matches, skip
      continue;
    }
    
    // Check if phrase matches in other language
    const otherMatch = otherTrie.findLongestMatch(template.vnl);
    
    if (otherMatch && isFlipLangFirst) {
      // Flip language to match the phrase
      console.log(`🔄 Flipping ${template.id} from ${currentLang} to ${otherLang}`);
      console.log(`   VNL: ${template.vnl}`);
      console.log(`   Matches frame: ${otherMatch.frameId} (${otherMatch.phrase})`);
      
      template.lang = otherLang;
      changes++;
      flipped++;
    } else if (otherMatch && isRewritePhrase) {
      // Rewrite phrase to match current language
      const targetFrame = frames.find(f => f.id === otherMatch.frameId);
      const targetPhrases = targetFrame?.langs?.[currentLang]?.phrases || [];
      
      if (targetPhrases.length > 0) {
        const canonicalPhrase = targetPhrases[0]; // Use first phrase as canonical
        const oldVnl = template.vnl;
        
        // Replace the beginning of the phrase while preserving placeholders
        const afterMatch = template.vnl.substring(otherMatch.phrase.length);
        const newVnl = canonicalPhrase + afterMatch;
        
        console.log(`✏️  Rewriting ${template.id} phrase:`);
        console.log(`   Old: ${oldVnl}`);
        console.log(`   New: ${newVnl}`);
        console.log(`   Frame: ${otherMatch.frameId}`);
        
        template.vnl = newVnl;
        changes++;
        rewritten++;
      }
    } else if (!isFlipLangFirst && !isRewritePhrase) {
      // Analysis mode - just report
      if (otherMatch) {
        console.log(`⚠️  ${template.id} (${currentLang}): "${template.vnl}"`);
        console.log(`   Could match ${otherLang} frame: ${otherMatch.frameId} (${otherMatch.phrase})`);
      } else {
        console.log(`❌ ${template.id} (${currentLang}): "${template.vnl}"`);
        console.log(`   No matches found in any language`);
      }
    }
  }
  
  if (changes > 0) {
    fs.writeFileSync(TEMPLATES_REG, JSON.stringify(templatesRegistry, null, 2));
    console.log(`\n✅ Applied ${changes} changes:`);
    if (flipped > 0) console.log(`   🔄 ${flipped} language flips`);
    if (rewritten > 0) console.log(`   ✏️  ${rewritten} phrase rewrites`);
    console.log(`\n💡 Run 'npm run templates:lint' to check results`);
  } else if (!isFlipLangFirst && !isRewritePhrase) {
    console.log(`\n📊 Analysis complete. Use --flip-lang-first or --rewrite-phrase to apply changes.`);
  } else {
    console.log(`\n✅ No changes needed in current mode.`);
  }
}

main();
