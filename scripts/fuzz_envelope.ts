// scripts/fuzz_envelope.ts
import fc from "fast-check";
import { makeAjv } from "../src/validator/ajv-config.js";

async function createSimpleSchema() {
  // Create a simple schema for testing without external references
  return {
    type: "object",
    required: ["mova_version", "actions"],
    properties: {
      mova_version: { type: "string", enum: ["3.3"] },
      id: { type: "string" },
      actions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string" },
            params: { type: "object" }
          }
        }
      }
    }
  };
}

const httpFetchArb = fc.record({
  type: fc.constant("http_fetch"),
  params: fc.record({
    endpoint: fc.oneof(
      fc.constant("https://api.example.com"),
      fc.constant("http://localhost:3000"),
      fc.constant("https://httpbin.org/anything")
    ),
    method: fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"),
    timeout_ms: fc.integer({ min: 1, max: 120000 })
  }, { requiredKeys: ["endpoint", "method"] })
});

const printArb = fc.record({
  type: fc.constant("print"),
  params: fc.record({
    value: fc.string({ minLength: 1, maxLength: 100 })
  }, { requiredKeys: ["value"] })
});

const setArb = fc.record({
  type: fc.constant("set"),
  params: fc.record({
    key: fc.string({ minLength: 1, maxLength: 50 }),
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean())
  }, { requiredKeys: ["key", "value"] })
});

const actionArb = fc.oneof(httpFetchArb, printArb, setArb);

const planArb = fc.record({
  mova_version: fc.constant("3.3"),
  id: fc.string({ minLength: 1, maxLength: 50 }),
  actions: fc.array(actionArb, { minLength: 1, maxLength: 5 })
});

async function main() {
  const schema = await createSimpleSchema();
  const ajv = makeAjv();
  const validate = ajv.compile(schema);
  
  let validCount = 0;
  let invalidCount = 0;

  console.log("🧪 Running fuzz tests for valid envelopes...");
  
  try {
    await fc.assert(
      fc.asyncProperty(planArb, async (plan) => {
        const result = validate(plan);
        if (!result) {
          console.error("Expected valid plan failed validation:", validate.errors);
          throw new Error(`Valid plan should pass validation: ${JSON.stringify(plan, null, 2)}`);
        }
        validCount++;
        return true;
      }),
      { numRuns: 100, verbose: false }
    );
    console.log(`✅ Valid envelope tests passed: ${validCount} cases`);
  } catch (e) {
    console.error("❌ Valid fuzz tests failed:", e);
    process.exit(1);
  }

  console.log("🧪 Running fuzz tests for invalid envelopes...");
  
  try {
    await fc.assert(
      fc.asyncProperty(planArb, async (plan) => {
        // Corrupt the plan to make it invalid
        const corruptedPlan = JSON.parse(JSON.stringify(plan));

        // Remove required field to make it invalid
        delete corruptedPlan.mova_version;
        
        const result = validate(corruptedPlan);
        if (result) {
          console.error("Expected invalid plan passed validation:", corruptedPlan);
          throw new Error("Invalid plan should fail validation");
        }
        invalidCount++;
        return true;
      }),
      { numRuns: 50, verbose: false }
    );
    console.log(`✅ Invalid envelope tests passed: ${invalidCount} cases`);
  } catch (e) {
    console.error("❌ Invalid fuzz tests failed:", e);
    process.exit(1);
  }

  console.log(`\n🎉 Fuzz testing completed successfully!`);
  console.log(`📊 Results: valid=${validCount}, invalid=${invalidCount}`);
  console.log(`✅ All ${validCount + invalidCount} test cases passed`);
}

main().catch(err => {
  console.error("❌ Fuzz testing failed:", err);
  process.exit(1);
});
