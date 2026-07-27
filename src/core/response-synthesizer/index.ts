/**
 * Response synthesizer entrypoint.
 *
 * Adds the "G" to RAG: takes ranked items + query and produces a
 * user-facing narrative. Never throws — on any failure the caller
 * still gets a Synthesis (with provider="none") and the ranked
 * items reach the user without commentary.
 *
 *   SYNTHESIS_PROVIDER=groq  (default when GROQ_API_KEY is set) → Groq
 *   SYNTHESIS_PROVIDER=none                                     → skip
 */

import { GroqSynthesizerError, synthesizeWithGroq } from "./groq";
import type { Synthesis, SynthesisInput } from "./types";

export type { Synthesis, SynthesisInput } from "./types";

function chosenProvider(): "groq" | "none" {
  const explicit = process.env.SYNTHESIS_PROVIDER?.toLowerCase();
  if (explicit === "groq" || explicit === "none") return explicit;
  return process.env.GROQ_API_KEY ? "groq" : "none";
}

const EMPTY: Synthesis = {
  summary: "",
  rationales: [],
  provider: "none",
};

export async function synthesize(input: SynthesisInput): Promise<Synthesis> {
  if (input.items.length === 0) {
    return { ...EMPTY, rationales: [] };
  }

  const provider = chosenProvider();
  if (provider === "none") {
    return {
      summary: "",
      rationales: new Array(input.items.length).fill(""),
      provider: "none",
    };
  }

  try {
    return await synthesizeWithGroq(input);
  } catch (err) {
    const message =
      err instanceof GroqSynthesizerError ? err.message : (err as Error).message;
    console.warn(`Groq synthesis failed, returning empty: ${message}`);
    return {
      summary: "",
      rationales: new Array(input.items.length).fill(""),
      provider: "none",
      fellBack: true,
    };
  }
}
