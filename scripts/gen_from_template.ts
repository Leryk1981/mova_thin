import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validate } from '../src/validator/validator.js';
import { compileVNL } from '../src/compiler/vnl_to_mova.js';

interface TemplateParam {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  required: boolean;
  description?: string;
  default?: any;
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

function parseValue(value: string, type: string): any {
  switch (type) {
    case 'number':
      const num = parseFloat(value);
      if (isNaN(num)) throw new Error(`Invalid number: ${value}`);
      return num;
    case 'integer':
      const int = parseInt(value, 10);
      if (isNaN(int)) throw new Error(`Invalid integer: ${value}`);
      return int;
    case 'boolean':
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      throw new Error(`Invalid boolean: ${value} (use 'true' or 'false')`);
    case 'string':
    default:
      return value;
  }
}

function substituteTemplate(template: string, params: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    const placeholder = `\${${key}}`;
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
  }
  return result;
}

function substituteEnvelopeTemplate(envelope: any, params: Record<string, any>): any {
  const jsonStr = JSON.stringify(envelope);
  const substituted = substituteTemplate(jsonStr, params);
  return JSON.parse(substituted);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const idIndex = args.indexOf('--id');
  if (idIndex === -1 || !args[idIndex + 1]) {
    console.error('Usage: tsx scripts/gen_from_template.ts --id <templateId> [--set key=value ...]');
    process.exit(1);
  }
  
  const templateId = args[idIndex + 1];
  
  // Parse --set parameters
  const setParams: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--set' && args[i + 1]) {
      const param = args[i + 1];
      const [key, ...valueParts] = param.split('=');
      if (!key || valueParts.length === 0) {
        console.error(`❌ Invalid --set parameter: ${param} (use --set key=value)`);
        process.exit(1);
      }
      setParams[key] = valueParts.join('=');
    }
  }
  
  console.log('🔍 AJV is single source of truth - generating from validated template...');
  
  try {
    // Load and validate registry
    const registryContent = await readFile('templates/registry.json', 'utf8');
    const registry: TemplateRegistry = JSON.parse(registryContent);
    
    // Find template
    const template = registry.templates.find(t => t.id === templateId);
    if (!template) {
      console.error(`❌ Template not found: ${templateId}`);
      console.error('Available templates:');
      registry.templates.forEach(t => {
        console.error(`  • ${t.id} - ${t.title}`);
      });
      process.exit(1);
    }
    
    console.log(`📝 Using template: ${template.title} (${template.style})`);
    
    // Validate required parameters
    const providedParams: Record<string, any> = {};
    for (const param of template.params) {
      if (param.required && !(param.name in setParams)) {
        if (param.default !== undefined) {
          providedParams[param.name] = param.default;
        } else {
          console.error(`❌ Missing required parameter: ${param.name}`);
          console.error(`Required parameters for ${templateId}:`);
          template.params.filter(p => p.required).forEach(p => {
            console.error(`  • ${p.name} (${p.type}): ${p.description || 'No description'}`);
          });
          process.exit(1);
        }
      } else if (param.name in setParams) {
        try {
          providedParams[param.name] = parseValue(setParams[param.name], param.type);
        } catch (error) {
          console.error(`❌ Invalid parameter ${param.name}: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      }
    }
    
    // Check for unknown parameters
    for (const key of Object.keys(setParams)) {
      if (!template.params.some(p => p.name === key)) {
        console.error(`❌ Unknown parameter: ${key}`);
        console.error(`Valid parameters for ${templateId}:`);
        template.params.forEach(p => {
          console.error(`  • ${p.name} (${p.type}): ${p.description || 'No description'}`);
        });
        process.exit(1);
      }
    }
    
    let envelope: any;
    
    if (template.style === 'vnl') {
      // VNL template - substitute and compile
      const vnlWithParams = substituteTemplate(template.vnl!, providedParams);
      console.log(`🔄 Compiling VNL: ${vnlWithParams}`);
      
      envelope = await compileVNL(vnlWithParams);
    } else {
      // Envelope template - direct substitution
      envelope = substituteEnvelopeTemplate(template.envelope!, providedParams);
    }
    
    // AJV validation - single source of truth
    console.log('🔍 Validating generated plan using AJV...');
    const result = await validate(envelope);
    if (!result.ok) {
      console.error('❌ Generated plan validation failed (AJV is single source of truth):');
      for (const error of result.errors) {
        console.error(`  • ${error}`);
      }
      process.exit(1);
    }
    
    // Write output
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = `examples/plans/generated/${templateId}.${timestamp}.json`;
    
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(envelope, null, 2), 'utf8');
    
    console.log(`✅ Generated plan: ${outputPath}`);
    console.log('✅ AJV validation passed - plan is valid!');
    
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
