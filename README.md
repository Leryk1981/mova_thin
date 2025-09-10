# @mova/thin-core

**MOVA 3.3 Thin Core** — schemas, precompiled validators, canonical examples & CLI for MOVA envelope and route validation.

## Install

```bash
npm i @mova/thin-core
# або локальний tarball:
# npm i ./mova-thin-core-3.3.0-rc.1.tgz
```

## Use (Node.js)

### ESM (recommended)
```js
import validators from "@mova/thin-core/validators";

const ENVELOPE_ID = "https://mova.dev/schemas/envelope.3.3.schema.json";
const ROUTE_ID = "https://mova.dev/schemas/route.1.0.schema.json";

const validateEnvelope = validators[ENVELOPE_ID];
const validateRoute = validators[ROUTE_ID];

// Validate envelope
const envelope = { 
  mova_version: "3.3", 
  actions: [{ type: "print", message: "Hello MOVA!" }] 
};

if (validateEnvelope(envelope)) {
  console.log("✅ Valid envelope");
} else {
  console.error("❌ Invalid envelope:", validateEnvelope.errors);
}

// Validate route
const route = {
  route_version: "1.0",
  trigger: { type: "http", http: { path: "/webhook", method: "POST" } },
  invoke: { plan_ref: "my.plan" }
};

if (validateRoute(route)) {
  console.log("✅ Valid route");
} else {
  console.error("❌ Invalid route:", validateRoute.errors);
}
```

### CommonJS
```js
const validators = require("@mova/thin-core/validators");

const ENVELOPE_ID = "https://mova.dev/schemas/envelope.3.3.schema.json";
const validate = validators[ENVELOPE_ID];
const data = { mova_version: "3.3", actions: [{ type: "print", message: "ok" }] };
console.log("valid?", validate(data));
```

## CLI

```bash
# Validate envelope
mova-validate envelope ./templates/canonical/envelope_min.json

# Validate route
mova-validate route ./templates/canonical/route_min_http_plan_ref.json

# Examples with custom files
mova-validate envelope ./my-envelope.json
mova-validate route ./my-route.json
```

## Schemas & Fingerprints

The package includes:
- `schemas/schema_manifest.json` — registry of all schemas
- `schemas/SCHEMA_FINGERPRINTS.json` — SHA-256 fingerprints for integrity verification
- Core schemas: `envelope.3.3.schema.json`, `route.1.0.schema.json`, `policies.schema.json`
- Action schemas in `schemas/actions/`

Verify schema integrity:
```bash
npm run verify:schemas
```

## Canonical Examples

See `templates/canonical/` for minimal working examples:

### Envelope (minimal)
```json
{
  "mova_version": "3.3",
  "actions": [
    { "type": "print", "message": "ok" }
  ]
}
```

### Route (minimal HTTP + plan_ref)
```json
{
  "route_version": "1.0",
  "trigger": { "type": "http", "http": { "path": "/webhook", "method": "POST" } },
  "invoke": { "plan_ref": "booking.book_by_time" }
}
```

### Route (inline plan)
```json
{
  "route_version": "1.0",
  "trigger": { "type": "http", "http": { "path": "/demo", "method": "POST" } },
  "invoke": {
    "plan": {
      "mova_version": "3.3",
      "actions": [{ "type": "print", "message": "inline ok" }]
    }
  }
}
```

## Error Format

Validation errors follow a standardized 422-style format:

```json
{
  "error": "ValidationError",
  "schema_id": "https://mova.dev/schemas/envelope.3.3.schema.json",
  "summary": "2 error(s)",
  "details": [
    {
      "path": "/actions/0",
      "message": "must have required property 'type'",
      "keyword": "required",
      "schemaPath": "#/properties/actions/items/required"
    }
  ]
}
```

## Available Validators

The precompiled validators include:
- `https://mova.dev/schemas/envelope.3.3.schema.json` — MOVA Envelope v3.3
- `https://mova.dev/schemas/route.1.0.schema.json` — MOVA Route v1.0
- Additional schemas for policies, actions, and lexicon

## Requirements

- Node.js >= 18
- No runtime dependencies (validators are precompiled)

## License

MIT
