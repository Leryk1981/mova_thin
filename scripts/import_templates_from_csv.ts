import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { validate } from '../src/validator/validator.js';
import { makeAjv } from '../src/validator/ajv-config.js';

interface CSVRow {
  id: string;
  category: string;
  intent_key: string;
  description: string;
  required_values: string;
}

interface TemplateParam {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  required: boolean;
  description?: string;
}

interface Template {
  id: string;
  title: string;
  lang: string;
  tags: string[];
  style: 'vnl' | 'envelope';
  params: TemplateParam[];
  vnl?: string;
  envelope?: object;
}

interface TemplateRegistry {
  version: string;
  templates: Template[];
}

function parseParams(requiredValues: string): TemplateParam[] {
  if (!requiredValues.trim()) return [];
  
  return requiredValues.split(',').map(param => {
    const name = param.trim();
    return {
      name,
      type: 'string' as const, // Default to string, could be enhanced later
      required: true,
      description: `Parameter for ${name}`
    };
  });
}

function generateVNLTemplate(intentKey: string, description: string, params: TemplateParam[]): string {
  // Generate a simple VNL template based on intent
  const paramPlaceholders = params.map(p => `\${${p.name}}`).join(' ');
  
  // Map common intents to VNL patterns
  const vnlPatterns: Record<string, string> = {
    'lead_capture': 'capture lead from ${source} with email ${email} and name ${name}',
    'lead_enrich': 'enrich lead with email ${email}',
    'lead_assign': 'assign lead ${lead_id} to owner ${owner_id}',
    'deal_create': 'create deal for lead ${lead_id} with amount ${amount} ${currency}',
    'quote_send': 'send quote for deal ${deal_id} to ${email} with pdf ${pdf_url}',
    'followup_schedule': 'schedule followup for lead ${lead_id} at ${when}',
    'churn_risk_alert': 'alert churn risk for account ${account_id} with score ${score}',
    'webhook_to_crm': 'send webhook ${event_type} with payload ${payload} to crm',
    'pipeline_move': 'move deal ${deal_id} to stage ${stage}',
    'email_send': 'send email to ${to} with subject ${subject} via ${via}',
    'http_status_check': 'check http status of ${endpoint}'
  };
  
  return vnlPatterns[intentKey] || `execute ${intentKey} with ${paramPlaceholders}`;
}

async function main() {
  const args = process.argv.slice(2);
  const inIndex = args.indexOf('--in');
  const outIndex = args.indexOf('--out');
  
  if (inIndex === -1 || outIndex === -1 || !args[inIndex + 1] || !args[outIndex + 1]) {
    console.error('Usage: tsx scripts/import_templates_from_csv.ts --in <csv-file> --out <json-file>');
    process.exit(1);
  }
  
  const csvPath = args[inIndex + 1];
  const jsonPath = args[outIndex + 1];
  
  console.log('🔍 AJV is single source of truth - importing CSV to validated template registry...');
  
  try {
    // Read and parse CSV
    const csvContent = await readFile(csvPath, 'utf8');
    const rows: CSVRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    console.log(`📊 Parsed ${rows.length} rows from CSV`);
    
    // Convert to template registry
    const templates: Template[] = rows.map(row => {
      const params = parseParams(row.required_values);
      const vnlTemplate = generateVNLTemplate(row.intent_key, row.description, params);
      
      return {
        id: row.intent_key,
        title: row.description,
        lang: 'uk', // Default to Ukrainian based on descriptions
        tags: [row.category.toLowerCase().replace(/\s+/g, '_')],
        style: 'vnl' as const, // Default to VNL for now
        params,
        vnl: vnlTemplate
      };
    });
    
    const registry: TemplateRegistry = {
      version: '1.0.0',
      templates
    };
    
    // AJV validation - single source of truth
    console.log('🔍 Validating registry against schema using AJV...');
    const ajv = makeAjv();
    const registrySchema = JSON.parse(await readFile('schemas/templates/registry.schema.json', 'utf8'));
    ajv.addSchema(registrySchema);
    
    const validateRegistry = ajv.compile(registrySchema);
    const isValid = validateRegistry(registry);
    
    if (!isValid) {
      console.error('❌ Registry validation failed (AJV is single source of truth):');
      for (const error of validateRegistry.errors || []) {
        console.error(`  • ${error.instancePath || '/'} ${error.message}`);
      }
      process.exit(1);
    }
    
    // Write registry
    await writeFile(jsonPath, JSON.stringify(registry, null, 2), 'utf8');
    
    console.log(`✅ Template registry created: ${jsonPath}`);
    console.log(`📝 Generated ${templates.length} templates`);
    console.log('✅ AJV validation passed - registry is valid!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
