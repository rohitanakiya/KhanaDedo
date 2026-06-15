/**
 * LLM-based filter extractor using Groq's Llama 3.3 70B Versatile.
 *
 * Why Groq over OpenAI/Claude:
 *   - Free tier covers all dev + early production traffic
 *   - Sub-second latency (Groq's specialty)
 *   - OpenAI-compatible API, so swappable later if needed
 *
 * Uses response_format=json_object to constrain output to valid JSON.
 * The result is then validated with Zod; on any failure (network,
 * parse, schema) the caller (index.ts) falls back to the regex
 * extractor — so this is a "best-effort upgrade", never a hard
 * dependency.
 */

import { z } from "zod";
import type { ExtractedFilters } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 5_000;

const ResponseSchema = z.object({
  city: z.string().nullish(),
  veg: z.boolean().nullish(),
  vegan: z.boolean().nullish(),
  maxPrice: z.number().nullish(),
  minProtein: z.number().nullish(),
});

const SYSTEM_PROMPT = `You extract structured food-search filters from a user's natural-language query.

Output ONLY a JSON object with these optional fields:
- "city": one of "bangalore", "mumbai", "delhi", "pune", "hyderabad", "chennai", "kolkata". If the user says "bengaluru", return "bangalore".
- "veg": true if user wants vegetarian (no meat, but dairy/eggs are OK), false if they explicitly want non-veg/chicken/mutton/fish/egg. IMPORTANT: if the user says "vegan", set veg=true AS WELL AS vegan=true (every vegan dish is vegetarian).
- "vegan": true ONLY if user explicitly wants vegan (no animal products at all). Synonyms: "plant-only", "dairy-free vegetarian", "fully plant-based".
- "maxPrice": maximum price in INR. "cheap"/"affordable"/"budget" => 300. "under N"/"below N" => N. Parse spelled-out numbers like "five hundred" => 500.
- "minProtein": minimum protein in grams. "high protein"/"protein-rich" => 20. "at least Ng protein" => N.

HARD RULE — do NOT infer fields from context, only from words the user actually used:
- If the user did NOT use the word "veg", "vegetarian", "plant-based", "vegan", "non-veg", or name a specific meat/fish/egg, OMIT the "veg" field entirely. Do not guess based on meal type, time of day, or cultural assumptions about Indian food.
- Same rule for every other field: omit unless the user's words clearly imply it.

Examples (note: empty objects are common and CORRECT — they mean "no structured filters; rank semantically"):
"cheap high protein veg in bangalore" -> {"city":"bangalore","veg":true,"maxPrice":300,"minProtein":20}
"something vegan and cheap" -> {"veg":true,"vegan":true,"maxPrice":300}
"plant-only protein-rich meal" -> {"veg":true,"vegan":true,"minProtein":20}
"vegetarian dinner with paneer" -> {"veg":true}
"comfort food" -> {}
"light but filling breakfast" -> {}
"something tasty" -> {}
"dinner for two" -> {}
"healthy lunch options" -> {}
"spicy non-veg dinner under 400" -> {"veg":false,"maxPrice":400}
"chicken dish under five hundred rupees" -> {"veg":false,"maxPrice":500}
"protein bowl" -> {"minProtein":20}

Respond with the JSON object only. No prose, no markdown, no code fences.`;

export class GroqExtractorError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "GroqExtractorError";
  }
}

export async function extractWithGroq(input: string): Promise<ExtractedFilters> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqExtractorError("GROQ_API_KEY not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: input },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GroqExtractorError("Groq request failed", err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GroqExtractorError(
      `Groq API ${response.status}: ${body.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new GroqExtractorError("Empty response from Groq");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new GroqExtractorError(`Invalid JSON from Groq: ${content.slice(0, 200)}`, err);
  }

  const validated = ResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new GroqExtractorError(
      `Schema mismatch from Groq: ${JSON.stringify(validated.error.issues)}`
    );
  }

  // Normalise: strip nulls, lowercase city, map bengaluru -> bangalore.
  // Enforce vegan => veg invariant in case the LLM forgets.
  const out: ExtractedFilters = {};
  if (validated.data.city) {
    const city = validated.data.city.toLowerCase();
    out.city = city === "bengaluru" ? "bangalore" : city;
  }
  if (typeof validated.data.veg === "boolean") out.veg = validated.data.veg;
  if (typeof validated.data.vegan === "boolean") {
    out.vegan = validated.data.vegan;
    if (validated.data.vegan === true) out.veg = true;
  }
  if (typeof validated.data.maxPrice === "number") out.maxPrice = validated.data.maxPrice;
  if (typeof validated.data.minProtein === "number") out.minProtein = validated.data.minProtein;

  return out;
}
