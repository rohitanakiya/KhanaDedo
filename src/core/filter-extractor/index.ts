/**
 * Filter extractor entrypoint.
 *
 * Picks a provider based on FILTER_PROVIDER env var:
 *   FILTER_PROVIDER=groq   - try Groq, fall back to regex on any error
 *   FILTER_PROVIDER=regex  - regex only (no LLM call)
 *
 * Default: "groq" if GROQ_API_KEY is set, otherwise "regex".
 *
 * The caller (chat.service) always gets a valid ExtractedFilters back,
 * never an error — the system degrades gracefully when Groq is
 * unavailable, rate-limited, or returns junk.
 */

import { extractWithGroq, GroqExtractorError } from "./groq";
import { extractWithRegex } from "./regex";
import type { FilterExtractionResult } from "./types";

export type { ExtractedFilters, FilterExtractionResult } from "./types";

function chosenProvider(): "groq" | "regex" {
  const explicit = process.env.FILTER_PROVIDER?.toLowerCase();
  if (explicit === "groq" || explicit === "regex") return explicit;
  return process.env.GROQ_API_KEY ? "groq" : "regex";
}

export async function extractFilters(input: string): Promise<FilterExtractionResult> {
  const provider = chosenProvider();

  if (provider === "regex") {
    return { filters: extractWithRegex(input), provider: "regex" };
  }

  try {
    const filters = await extractWithGroq(input);
    return { filters, provider: "groq" };
  } catch (err) {
    const message =
      err instanceof GroqExtractorError ? err.message : (err as Error).message;
    console.warn(`Groq filter extraction failed, falling back to regex: ${message}`);
    return {
      filters: extractWithRegex(input),
      provider: "regex",
      fellBack: true,
    };
  }
}
