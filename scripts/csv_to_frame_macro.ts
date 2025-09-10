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

interface FrameParam {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  required: boolean;
  description?: string;
  default?: any;
}

interface Frame {
  id: string;
  verb: string;
  noun: string;
  langs: Record<string, { phrases: string[]; allow_inverted?: boolean }>;
  params: FrameParam[];
  macro: string;
  description?: string;
}

interface FrameRegistry {
  version: string;
  frames: Frame[];
}

interface MacroAction {
  type: string;
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

function parseParams(requiredValues: string): FrameParam[] {
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

function parseVerbNoun(intentKey: string): { verb: string; noun: string; frameId: string } {
  // Parse intent_key to extract verb and noun
  const parts = intentKey.toLowerCase().split('_');
  
  // Common patterns for verb-noun extraction
  const verbNounMap: Record<string, { verb: string; noun: string }> = {
    'email_send': { verb: 'send', noun: 'email' },
    'lead_capture': { verb: 'capture', noun: 'lead' },
    'lead_enrich': { verb: 'enrich', noun: 'lead' },
    'lead_assign': { verb: 'assign', noun: 'lead' },
    'deal_create': { verb: 'create', noun: 'deal' },
    'quote_send': { verb: 'send', noun: 'quote' },
    'followup_schedule': { verb: 'schedule', noun: 'followup' },
    'churn_risk_alert': { verb: 'alert', noun: 'churn_risk' },
    'webhook_to_crm': { verb: 'send', noun: 'webhook' },
    'pipeline_move': { verb: 'move', noun: 'pipeline' },
    'meeting_log': { verb: 'log', noun: 'meeting' },
    'campaign_create': { verb: 'create', noun: 'campaign' },
    'newsletter_send': { verb: 'send', noun: 'newsletter' },
    'utm_report': { verb: 'report', noun: 'utm' },
    'social_post': { verb: 'post', noun: 'social' },
    'social_schedule': { verb: 'schedule', noun: 'social' },
    'ad_leads_sync': { verb: 'sync', noun: 'ad_leads' },
    'seo_ping': { verb: 'ping', noun: 'seo' },
    'web_form_notify': { verb: 'notify', noun: 'web_form' },
    'segment_export': { verb: 'export', noun: 'segment' },
    'blog_publish': { verb: 'publish', noun: 'blog' },
    'ticket_create': { verb: 'create', noun: 'ticket' },
    'ticket_escalate': { verb: 'escalate', noun: 'ticket' },
    'csat_request': { verb: 'request', noun: 'csat' },
    'sentiment_alert': { verb: 'alert', noun: 'sentiment' },
    'knowledge_sync': { verb: 'sync', noun: 'knowledge' },
    'invoice_sync': { verb: 'sync', noun: 'invoice' },
    'payment_reconcile': { verb: 'reconcile', noun: 'payment' },
    'refund_process': { verb: 'process', noun: 'refund' },
    'subscription_renewal_notice': { verb: 'notice', noun: 'subscription_renewal' },
    'expense_ingest': { verb: 'ingest', noun: 'expense' },
    'deploy_webhook': { verb: 'deploy', noun: 'webhook' },
    'healthcheck_alert': { verb: 'alert', noun: 'healthcheck' },
    'uptime_report': { verb: 'report', noun: 'uptime' },
    'log_aggregate': { verb: 'aggregate', noun: 'log' },
    'incident_open': { verb: 'open', noun: 'incident' },
    'github_issue_sync': { verb: 'sync', noun: 'github_issue' },
    'backup_report': { verb: 'report', noun: 'backup' },
    'cache_invalidate': { verb: 'invalidate', noun: 'cache' },
    'fetch_json': { verb: 'fetch', noun: 'json' },
    'parse_csv': { verb: 'parse', noun: 'csv' },
    'sheet_append': { verb: 'append', noun: 'sheet' },
    'db_upsert': { verb: 'upsert', noun: 'db' },
    's3_put': { verb: 'put', noun: 's3' },
    'rss_ingest': { verb: 'ingest', noun: 'rss' },
    'dedupe_list': { verb: 'dedupe', noun: 'list' },
    'geo_enrich': { verb: 'enrich', noun: 'geo' },
    'slack_notify': { verb: 'notify', noun: 'slack' },
    'telegram_notify': { verb: 'notify', noun: 'telegram' },
    'sms_send': { verb: 'send', noun: 'sms' }
  };
  
  const mapped = verbNounMap[intentKey];
  if (mapped) {
    return { ...mapped, frameId: intentKey };
  }
  
  // Fallback: try to split by common patterns
  if (parts.length >= 2) {
    // Last part is usually verb, rest is noun
    const verb = parts[parts.length - 1];
    const noun = parts.slice(0, -1).join('_');
    return { verb, noun, frameId: intentKey };
  }
  
  // Default fallback
  return { verb: 'execute', noun: intentKey, frameId: intentKey };
}

function generatePhrases(verb: string, noun: string, description: string): { en: string[]; uk: string[] } {
  // Generate English phrases
  const enPhrases = [
    `${verb} ${noun}`,
    `${verb} ${noun.replace(/_/g, ' ')}`,
  ];
  
  // Generate Ukrainian phrases based on description
  const ukPhrases = [description.toLowerCase()];
  
  // Add common verb translations
  const verbTranslations: Record<string, string> = {
    'send': 'відправити',
    'capture': 'захопити',
    'create': 'створити',
    'enrich': 'збагатити',
    'assign': 'призначити',
    'schedule': 'запланувати',
    'alert': 'сповістити',
    'move': 'перемістити',
    'log': 'записати',
    'post': 'опублікувати',
    'sync': 'синхронізувати',
    'ping': 'пінгувати',
    'notify': 'повідомити',
    'export': 'експортувати',
    'publish': 'опублікувати',
    'escalate': 'ескалувати',
    'request': 'запросити',
    'reconcile': 'звірити',
    'process': 'обробити',
    'notice': 'повідомити',
    'ingest': 'завантажити',
    'deploy': 'розгорнути',
    'report': 'звітувати',
    'aggregate': 'агрегувати',
    'open': 'відкрити',
    'invalidate': 'інвалідувати',
    'fetch': 'отримати',
    'parse': 'парсити',
    'append': 'додати',
    'upsert': 'оновити',
    'put': 'покласти',
    'dedupe': 'дедуплікувати'
  };
  
  const nounTranslations: Record<string, string> = {
    'email': 'емейл',
    'lead': 'лід',
    'deal': 'угода',
    'quote': 'пропозиція',
    'followup': 'слідування',
    'webhook': 'вебхук',
    'pipeline': 'воронка',
    'meeting': 'зустріч',
    'campaign': 'кампанія',
    'newsletter': 'розсилка',
    'ticket': 'тікет',
    'invoice': 'рахунок',
    'payment': 'платіж',
    'refund': 'повернення',
    'expense': 'витрата',
    'incident': 'інцидент',
    'backup': 'резервна копія',
    'cache': 'кеш',
    'json': 'json',
    'csv': 'csv',
    'sheet': 'таблиця',
    'list': 'список',
    'slack': 'слак',
    'telegram': 'телеграм',
    'sms': 'смс'
  };
  
  const ukVerb = verbTranslations[verb] || verb;
  const ukNoun = nounTranslations[noun] || noun;
  
  if (ukVerb !== verb || ukNoun !== noun) {
    ukPhrases.push(`${ukVerb} ${ukNoun}`);
  }
  
  return {
    en: [...new Set(enPhrases)],
    uk: [...new Set(ukPhrases)]
  };
}

function generateMacroTemplate(frameId: string, verb: string, noun: string, params: FrameParam[]): Macro {
  const macroId = `${frameId}_basic`;
  
  // Generate macro based on verb-noun pattern
  if (verb === 'send' && (noun.includes('email') || noun.includes('sms') || noun.includes('newsletter'))) {
    return {
      id: macroId,
      description: `Basic macro for ${verb} ${noun}`,
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
          { type: 'print', message: `${frameId} → {{last_result.status||'ok'}}` }
        ]
      }
    };
  }
  
  if (verb === 'fetch' || verb === 'sync' || noun.includes('api') || noun.includes('http')) {
    return {
      id: macroId,
      description: `Basic macro for ${verb} ${noun}`,
      render: {
        actions: [
          {
            type: 'http_fetch',
            endpoint: params.find(p => p.name === 'endpoint') ? '${endpoint}' : '${CONFIG.API_ENDPOINT}',
            method: params.find(p => p.name === 'method') ? '${method}' : 'GET'
          },
          { type: 'parse_json', from: 'resp.text' },
          { type: 'print', message: `${frameId} → {{last_result.status||'ok'}}` }
        ]
      }
    };
  }
  
  // Default simple macro
  return {
    id: macroId,
    description: `Basic macro for ${verb} ${noun}`,
    render: {
      actions: [
        {
          type: 'print',
          message: `Executing ${frameId} with params: ${params.map(p => `\${${p.name}}`).join(', ')}`
        }
      ]
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const inIndex = args.indexOf('--in');
  const frameOutIndex = args.indexOf('--frame-out');
  const macroOutIndex = args.indexOf('--macro-out');
  
  if (inIndex === -1 || frameOutIndex === -1 || macroOutIndex === -1 || 
      !args[inIndex + 1] || !args[frameOutIndex + 1] || !args[macroOutIndex + 1]) {
    console.error('Usage: tsx scripts/csv_to_frame_macro.ts --in <csv-file> --frame-out <frame-json> --macro-out <macro-json>');
    process.exit(1);
  }
  
  const csvPath = args[inIndex + 1];
  const framePath = args[frameOutIndex + 1];
  const macroPath = args[macroOutIndex + 1];
  
  console.log('🔍 AJV is single source of truth - creating Frame Registry (verb+noun pairs)...');
  
  try {
    // Read and parse CSV
    const csvContent = await readFile(csvPath, 'utf8');
    const rows: CSVRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    console.log(`📊 Parsed ${rows.length} rows from CSV`);
    
    // Generate frame registry
    const frames: Frame[] = rows.map(row => {
      const params = parseParams(row.required_values);
      const { verb, noun, frameId } = parseVerbNoun(row.intent_key);
      const phrases = generatePhrases(verb, noun, row.description);
      
      return {
        id: frameId,
        verb,
        noun,
        langs: {
          en: { phrases: phrases.en },
          uk: { phrases: phrases.uk }
        },
        params,
        macro: `${frameId}_basic`,
        description: row.description
      };
    });
    
    const frameRegistry: FrameRegistry = {
      version: '1.0.0',
      frames
    };
    
    // Generate macro registry
    const macros: Macro[] = frames.map(frame => 
      generateMacroTemplate(frame.id, frame.verb, frame.noun, frame.params)
    );
    
    const macroRegistry: MacroRegistry = {
      version: '1.0.0',
      macros
    };
    
    // AJV validation - single source of truth
    console.log('🔍 Validating registries against schemas using AJV...');
    const ajv = makeAjv();
    
    // Validate frame registry
    const frameSchema = JSON.parse(await readFile('schemas/lexicon/frame_registry.schema.json', 'utf8'));
    ajv.addSchema(frameSchema);
    const validateFrames = ajv.compile(frameSchema);
    
    if (!validateFrames(frameRegistry)) {
      console.error('❌ Frame registry validation failed (AJV is single source of truth):');
      for (const error of validateFrames.errors || []) {
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
    await writeFile(framePath, JSON.stringify(frameRegistry, null, 2), 'utf8');
    await writeFile(macroPath, JSON.stringify(macroRegistry, null, 2), 'utf8');
    
    console.log(`✅ Frame registry created: ${framePath}`);
    console.log(`✅ Macro registry created: ${macroPath}`);
    console.log(`📝 Generated ${frames.length} frames and ${macros.length} macros`);
    console.log('✅ AJV validation passed - registries are valid!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
