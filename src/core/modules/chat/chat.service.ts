import { getEmbeddingsProvider } from "../../embeddings";
import { extractFilters } from "../../filter-extractor";
import { getMenuItems } from "../menu/menu.service";

// ---------- Embedding helpers ----------

/**
 * pg returns JSONB columns already parsed (number[]), but some driver
 * configurations could leave it as a string. Handle both.
 */
function coerceEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    return raw as number[];
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ---------- Hybrid scoring ----------

/**
 * Combines semantic similarity, protein density, and restaurant rating
 * into a single ranking score. Weights are tunable.
 *
 * - similarity: how well the dish description matches the user's intent
 * - protein:    normalised against an expected ceiling of 50g
 * - rating:     normalised against the 5-star scale
 */
function hybridScore(
  similarity: number,
  protein: number,
  rating: number | null
): number {
  const proteinScore = Math.min(protein / 50, 1);
  const ratingScore = rating === null ? 0.5 : rating / 5;

  return 0.7 * similarity + 0.2 * proteinScore + 0.1 * ratingScore;
}

// ---------- Main entry point ----------

export async function getRecommendationsFromText(input: string) {
  // 1. Extract structured filters from the natural-language query.
  //    The extractor picks Groq if available and falls back to regex.
  const { filters, provider: filterProvider, fellBack } = await extractFilters(input);

  // 2. Narrow the candidate set with SQL filters.
  const items = await getMenuItems({
    ...filters,
    limit: 50,
    offset: 0,
  });

  // 3. Embed the query for semantic ranking.
  let queryEmbedding: number[] | null = null;
  let embeddingProvider = "none";

  try {
    const provider = getEmbeddingsProvider();
    embeddingProvider = provider.name;
    queryEmbedding = await provider.embed(input);
  } catch (err) {
    // If the provider can't initialise (e.g. OpenAI selected with no
    // API key), fall back to filter-only ranking instead of erroring.
    console.warn("Embeddings provider unavailable, falling back:", (err as Error).message);
  }

  // 4. Score each candidate and rank.
  const scored = items.map((item) => {
    const itemEmbedding = coerceEmbedding(item.embedding);

    const similarity =
      queryEmbedding && itemEmbedding
        ? cosineSimilarity(queryEmbedding, itemEmbedding)
        : 0;

    const score = hybridScore(similarity, item.protein, item.rating);

    return {
      ...item,
      embedding: undefined, // strip raw vector from API response
      similarity: queryEmbedding && itemEmbedding ? similarity : null,
      score,
    };
  });

  const ranked = scored.sort((a, b) => b.score - a.score);

  return {
    provider: embeddingProvider,
    filterProvider,
    ...(fellBack ? { filterProviderFellBack: true } : {}),
    filters,
    recommendations: ranked.slice(0, 10),
  };
}
