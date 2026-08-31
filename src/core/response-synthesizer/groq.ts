/**
 * LLM-based response synthesizer using Groq's Llama 3.3 70B.
 *
 * Called after retrieval + ranking to turn a raw top-N list into a
 * user-facing narrative:
 *   - A one-sentence summary framing the result set for the query
 *   - A one-line rationale per item explaining why it ranks where it does
 *
 * Response is JSON-mode + Zod-validated. Any failure at the caller
 * (index.ts) short-circuits to a "no synthesis" result so the ranked
 * items still reach the user.
 *
 * Prompt is intentionally compact — we ship ~150 tokens of context
 * per item, aiming for total prompt <= ~1500 tokens on top-10.
 */

import { z } from "zod";
import type { Synthesis, SynthesisInput } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Synthesizer uses its own model env because the smaller 20b is unreliable
// with json_object mode (returns failed_generation ~30% of the time on
// real Swiggy item names). 120b is still on Groq's dev tier and handles
// the JSON schema cleanly. Filter extraction stays on GROQ_MODEL (20b).
const MODEL = process.env.GROQ_SYNTH_MODEL ?? "openai/gpt-oss-120b";
const TIMEOUT_MS = 6_000;

const ResponseSchema = z.object({
  summary: z.string().min(1),
  rationales: z.array(z.string()),
  // Best-effort per-item macros the model estimates from the dish name.
  // Null when the model is unsure — never fabricate a number.
  nutrition: z
    .array(
      z.object({
        proteinG: z.number().nullable().optional(),
        caloriesKcal: z.number().nullable().optional(),
      })
    )
    .default([]),
});

const SYSTEM_PROMPT = `You explain ranked food recommendations to the user in a warm, decisive voice.

You will receive a user query, extracted filters, and a ranked list of items with fields.
Output ONLY a JSON object with:
- "summary": one sentence (max ~200 chars) that frames the result set for this specific query. No preamble like "Here are..."; jump straight to the substance. Warm but not saccharine.
- "rationales": array of one-line strings, SAME LENGTH and SAME ORDER as the input items. Each is <= 80 chars and says WHY this item earned its rank vs the others (cheaper, more protein, better rating, closest semantic match, vegan-safe, etc). Never repeat the item's name — the UI already shows it.
- "nutrition": array of {proteinG, caloriesKcal} objects, SAME LENGTH and SAME ORDER as items. For each item, estimate grams of protein and kcal per typical serving from the dish name (e.g. "Paneer Tikka Bowl" ≈ 22g / 480kcal, "Margherita Pizza" whole ≈ 30g / 800kcal, "Chicken Biryani" ≈ 35g / 720kcal). If an item has proteinG or caloriesKcal already listed in its context, echo those exact numbers. If a dish is truly ambiguous (e.g. just "combo"), return null for that field — do NOT fabricate.

If an item is a poor match despite ranking (e.g. cheapest but low protein when user asked for high-protein), be honest about the tradeoff in its rationale.

Respond with the JSON object only. No prose, no markdown, no code fences.`;

export class GroqSynthesizerError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "GroqSynthesizerError";
  }
}

function formatItemsForPrompt(input: SynthesisInput): string {
  return input.items
    .map((it, i) => {
      const parts: string[] = [
        `${i + 1}. ${it.name} @ ${it.restaurantName}`,
        `₹${it.priceInr}`,
      ];
      if (typeof it.rating === "number") parts.push(`${it.rating}⭐`);
      if (typeof it.proteinG === "number") parts.push(`${it.proteinG}g protein`);
      if (typeof it.caloriesKcal === "number") parts.push(`${it.caloriesKcal}kcal`);
      if (it.isVegan) parts.push("vegan");
      else if (it.isVeg === true) parts.push("veg");
      else if (it.isVeg === false) parts.push("non-veg");
      if (typeof it.similarity === "number") {
        parts.push(`sim=${Math.round(it.similarity * 100)}%`);
      }
      const desc = it.description
        ? ` — ${it.description.slice(0, 120)}`
        : "";
      return `${parts.join(" · ")}${desc}`;
    })
    .join("\n");
}

export async function synthesizeWithGroq(
  input: SynthesisInput
): Promise<Synthesis> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqSynthesizerError("GROQ_API_KEY not set");
  }

  if (input.items.length === 0) {
    return {
      summary: "No items matched those constraints.",
      rationales: [],
      nutrition: [],
      provider: "groq",
    };
  }

  const filtersJson = JSON.stringify(input.filters);
  const userMsg = `Query: "${input.query}"
Extracted filters: ${filtersJson}

Ranked items:
${formatItemsForPrompt(input)}`;

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
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        // Real Swiggy item names can be 60+ chars ("SUPERYOU High Protein
        // Thincrust All Veg Pizza with Crumbled Feta") — top-10 with
        // rationales blows past 700 tokens. Bumped so gpt-oss-20b actually
        // finishes valid JSON instead of returning `failed_generation`.
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GroqSynthesizerError("Groq request failed", err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GroqSynthesizerError(
      `Groq API ${response.status}: ${body.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GroqSynthesizerError("Empty response from Groq");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new GroqSynthesizerError(
      `Invalid JSON from Groq: ${content.slice(0, 200)}`,
      err
    );
  }

  const validated = ResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new GroqSynthesizerError(
      `Schema mismatch: ${JSON.stringify(validated.error.issues)}`
    );
  }

  // Ensure rationales + nutrition length matches items length. LLMs
  // occasionally return one too many / few; pad or truncate rather than fail.
  const rationales = [...validated.data.rationales];
  while (rationales.length < input.items.length) rationales.push("");
  rationales.length = input.items.length;

  const rawNutrition = validated.data.nutrition;
  const nutrition = input.items.map((_, i) => {
    const n = rawNutrition[i];
    return {
      proteinG:
        n?.proteinG != null && Number.isFinite(n.proteinG)
          ? Math.round(n.proteinG)
          : undefined,
      caloriesKcal:
        n?.caloriesKcal != null && Number.isFinite(n.caloriesKcal)
          ? Math.round(n.caloriesKcal)
          : undefined,
    };
  });

  return {
    summary: validated.data.summary,
    rationales,
    nutrition,
    provider: "groq",
  };
}
