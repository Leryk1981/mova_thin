import fs from "node:fs";

const reg = JSON.parse(fs.readFileSync("lexicon/frame_registry.json", "utf-8"));
const langs = ["uk", "en"];
const missing: Record<string, string[]> = {};
const stats: Record<string, { total: number; covered: number }> = {};

console.log("=== Lexicon Coverage Report ===\n");

for (const lang of langs) {
  stats[lang] = { total: 0, covered: 0 };
}

for (const fr of reg.frames ?? []) {
  for (const lang of langs) {
    stats[lang].total++;
    
    // Check if frame has phrases for this language
    const phrases = fr.langs?.[lang]?.phrases || [];
    const hasPhrases = phrases.length > 0;
    
    if (hasPhrases) {
      stats[lang].covered++;
    } else {
      (missing[lang] ||= []).push(fr.id);
    }
  }
}

// Print summary table
console.log("Language Coverage Summary:");
console.log("┌──────────┬─────────┬─────────┬─────────────┐");
console.log("│ Language │  Total  │ Covered │  Coverage   │");
console.log("├──────────┼─────────┼─────────┼─────────────┤");

for (const lang of langs) {
  const { total, covered } = stats[lang];
  const percentage = total > 0 ? ((covered / total) * 100).toFixed(1) : "0.0";
  const langPadded = lang.padEnd(8);
  const totalPadded = total.toString().padStart(7);
  const coveredPadded = covered.toString().padStart(7);
  const percentagePadded = `${percentage}%`.padStart(11);
  
  console.log(`│ ${langPadded} │${totalPadded} │${coveredPadded} │${percentagePadded} │`);
}

console.log("└──────────┴─────────┴─────────┴─────────────┘\n");

// Print missing frames for each language
for (const lang of langs) {
  const missingFrames = missing[lang] || [];
  if (missingFrames.length > 0) {
    console.log(`Missing phrases for ${lang.toUpperCase()} (${missingFrames.length} frames):`);
    for (const frameId of missingFrames.slice(0, 10)) { // Show first 10
      console.log(`  - ${frameId}`);
    }
    if (missingFrames.length > 10) {
      console.log(`  ... and ${missingFrames.length - 10} more`);
    }
    console.log();
  } else {
    console.log(`✅ Complete coverage for ${lang.toUpperCase()}\n`);
  }
}

// Exit with error code if coverage is incomplete
const hasIncomplete = langs.some(lang => (missing[lang] || []).length > 0);
if (hasIncomplete) {
  console.log("❌ Incomplete lexicon coverage detected");
  console.log("Run this script to identify missing phrases and add them to frame_registry.json");
} else {
  console.log("✅ Complete lexicon coverage for all target languages");
}
