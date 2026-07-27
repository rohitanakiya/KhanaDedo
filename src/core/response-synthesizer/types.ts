/**
 * Input given to a synthesizer — enough context for it to generate
 * a query-aware summary + per-item rationales.
 */
export interface SynthesisInput {
  query: string;
  filters: {
    city?: string;
    veg?: boolean;
    vegan?: boolean;
    maxPrice?: number;
    minProtein?: number;
  };
  items: Array<{
    name: string;
    restaurantName: string;
    priceInr: number;
    rating?: number | null;
    isVeg?: boolean;
    isVegan?: boolean;
    /** Nutrition info if available (seeded path only). */
    proteinG?: number;
    caloriesKcal?: number;
    description?: string;
    /** 0..1 cosine similarity between query and item. */
    similarity?: number | null;
  }>;
}

export interface Synthesis {
  /** One-sentence framing of the whole result set (<= ~200 chars). */
  summary: string;
  /**
   * Same length as SynthesisInput.items, in the same order. Each entry
   * is a short (<= ~80 char) rationale explaining why the item ranks
   * where it does relative to the user's query.
   */
  rationales: string[];
  /** Which provider produced this — for UI attribution + debugging. */
  provider: "groq" | "none";
  /** True when we tried Groq and fell back to no synthesis. */
  fellBack?: boolean;
}
