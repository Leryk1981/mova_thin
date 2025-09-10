import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { makeAjv } from '../src/validator/ajv-config.js';

interface CSVRow {
  id: string;
  category: string;
  intent_key: string;
  description: string;
  required_values: string;
}

interface VerbParam {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  required: boolean;
  description?: string;
  default?: any;
}

interface Verb {
  id: string;
  langs: Record<string, { synonyms: string[] }>;
  params: VerbParam[];
  macro: string;
  description?: string;
}

interface VerbRegistry {
  version: string;
  verbs: Verb[];
}

interface MacroAction {
  type: string;
  params?: any;
  [key: string]: any;
}

interface Macro {
  id: string;
  description?: string;
  render: {
    actions: MacroAction[];
  };
}

interface MacroRegistry {
  version: string;
  macros: Macro[];
}

function parseParams(requiredValues: string): VerbParam[] {
  if (!requiredValues.trim()) return [];
  
  return requiredValues.split(',').map(param => {
    const name = param.trim();
    return {
      name,
      type: 'string' as const,
      required: true,
      description: `Parameter for ${name}`
    };
  });
}

function generateCanonicalVerbId(intentKey: string): string {
  // Normalize intent key to canonical verb id
  return intentKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function generateSynonyms(intentKey: string, description: string): { en: string[], uk: string[] } {
  // Generate English synonyms based on intent key
  const enSynonyms = [intentKey.replace(/_/g, ' ')];
  
  // Generate Ukrainian synonyms based on description
  const ukSynonyms = [description.toLowerCase()];
  
  // Add common patterns
  const verbMap: Record<string, { en: string[], uk: string[] }> = {
    'email_send': { 
      en: ['send email', 'email', 'mail'], 
      uk: ['надіслати емейл', 'відправити email', 'надіслати лист'] 
    },
    'lead_capture': { 
      en: ['capture lead', 'create lead', 'add lead'], 
      uk: ['занести ліда', 'створити ліда', 'додати ліда'] 
    },
    'http_fetch': { 
      en: ['fetch http', 'http request', 'call api'], 
      uk: ['зробити запит', 'викликати api', 'отримати дані'] 
    }
  };
  
  const canonical = generateCanonicalVerbId(intentKey);
  if (verbMap[canonical]) {
    return verbMap[canonical];
  }
  
  return { en: enSynonyms, uk: ukSynonyms };
}

function generateMacroTemplate(verbId: string, params: VerbParam[]): Macro {
  // Generate basic macro template based on verb type
  const macroId = `${verbId}_basic`;

  // Common macro patterns
  if (verbId.includes('email') || verbId.includes('send')) {
    return {
      id: macroId,
      description: `Basic macro for ${verbId}`,
      render: {
        actions: [
          {
            type: 'http_fetch',
            endpoint: '${CONFIG.EMAIL_ENDPOINT}',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            payload: params.reduce((acc, p) => ({ ...acc, [p.name]: `\${${p.name}}` }), {})
          },
          { type: 'parse_json', from: 'resp.text' },
          { type: 'print', message: `${verbId} → {{last_result.status||'ok'}}` }
        ]
      }
    };
  }

  if (verbId.includes('http') || verbId.includes('fetch') || verbId.includes('api')) {
    return {
      id: macroId,
      description: `Basic macro for ${verbId}`,
      render: {
        actions: [
          {
            type: 'http_fetch',
            endpoint: params.find(p => p.name === 'endpoint') ? '${endpoint}' : '${CONFIG.API_ENDPOINT}',
            method: params.find(p => p.name === 'method') ? '${method}' : 'GET'
          },
          { type: 'parse_json', from: 'resp.text' },
          { type: 'print', message: `${verbId} → {{last_result.status||'ok'}}` }
        ]
      }
    };
  }

  // Default generic macro
  return {
    id: macroId,
    description: `Basic macro for ${verbId}`,
    render: {
      actions: [
        {
          type: 'print',
          message: `Executing ${verbId} with params: ${params.map(p => `\${${p.name}}`).join(', ')}`
        }
      ]
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const inIndex = args.indexOf('--in');
  const verbOutIndex = args.indexOf('--verb-out');
  const macroOutIndex = args.indexOf('--macro-out');
  
  if (inIndex === -1 || verbOutIndex === -1 || macroOutIndex === -1 || 
      !args[inIndex + 1] || !args[verbOutIndex + 1] || !args[macroOutIndex + 1]) {
    console.error('Usage: tsx scripts/csv_to_verb_macro.ts --in <csv-file> --verb-out <verb-json> --macro-out <macro-json>');
    process.exit(1);
  }
  
  const csvPath = args[inIndex + 1];
  const verbPath = args[verbOutIndex + 1];
  const macroPath = args[macroOutIndex + 1];
  
  console.log('🔍 AJV is single source of truth - creating canonical verb & macro registries...');
  
  try {
    // Read and parse CSV
    const csvContent = await readFile(csvPath, 'utf8');
    const rows: CSVRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    console.log(`📊 Parsed ${rows.length} rows from CSV`);
    
    // Generate verb registry
    const verbs: Verb[] = rows.map(row => {
      const params = parseParams(row.required_values);
      const verbId = generateCanonicalVerbId(row.intent_key);
      const synonyms = generateSynonyms(row.intent_key, row.description);
      
      return {
        id: verbId,
        langs: {
          en: { synonyms: synonyms.en },
          uk: { synonyms: synonyms.uk }
        },
        params,
        macro: `${verbId}_basic`,
        description: row.description
      };
    });
    
    const verbRegistry: VerbRegistry = {
      version: '1.0.0',
      verbs
    };
    
    // Generate macro registry
    const macros: Macro[] = verbs.map(verb => generateMacroTemplate(verb.id, verb.params));
    
    const macroRegistry: MacroRegistry = {
      version: '1.0.0',
      macros
    };
    
    // AJV validation - single source of truth
    console.log('🔍 Validating registries against schemas using AJV...');
    const ajv = makeAjv();
    
    // Validate verb registry
    const verbSchema = JSON.parse(await readFile('schemas/lexicon/verb_registry.schema.json', 'utf8'));
    ajv.addSchema(verbSchema);
    const validateVerbs = ajv.compile(verbSchema);
    
    if (!validateVerbs(verbRegistry)) {
      console.error('❌ Verb registry validation failed (AJV is single source of truth):');
      for (const error of validateVerbs.errors || []) {
        console.error(`  • ${error.instancePath || '/'} ${error.message}`);
      }
      process.exit(1);
    }
    
    // Validate macro registry
    const macroSchema = JSON.parse(await readFile('schemas/lexicon/macro_registry.schema.json', 'utf8'));
    ajv.addSchema(macroSchema);
    const validateMacros = ajv.compile(macroSchema);
    
    if (!validateMacros(macroRegistry)) {
      console.error('❌ Macro registry validation failed (AJV is single source of truth):');
      for (const error of validateMacros.errors || []) {
        console.error(`  • ${error.instancePath || '/'} ${error.message}`);
      }
      process.exit(1);
    }
    
    // Write registries
    await writeFile(verbPath, JSON.stringify(verbRegistry, null, 2), 'utf8');
    await writeFile(macroPath, JSON.stringify(macroRegistry, null, 2), 'utf8');
    
    console.log(`✅ Verb registry created: ${verbPath}`);
    console.log(`✅ Macro registry created: ${macroPath}`);
    console.log(`📝 Generated ${verbs.length} verbs and ${macros.length} macros`);
    console.log('✅ AJV validation passed - registries are valid!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
