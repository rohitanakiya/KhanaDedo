import { getEmbeddingsProvider } from "../../embeddings";
import { extractFilters } from "../../filter-extractor";
import { synthesize } from "../../response-synthesizer";
import type { ExtractedFilters } from "../../filter-extractor";
import { getSwiggyClient } from "../../swiggy/factory";
import { getToken } from "../../swiggy/tokens";
import type { SwiggyMenuItem } from "../../swiggy/types";
import { getMenuItems } from "../menu/menu.service";

// ---------- Shared helpers ----------

function coerceEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
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
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Score formula for SEEDED data (has protein + calories).
 *  - similarity 70% / protein density 20% / rating 10%
 */
function seededScore(similarity: number, protein: number, rating: number | null): number {
  const proteinScore = Math.min(protein / 50, 1);
  const ratingScore = rating === null ? 0.5 : rating / 5;
  return 0.7 * similarity + 0.2 * proteinScore + 0.1 * ratingScore;
}

/**
 * Score formula for SWIGGY data (no nutrition info).
 *  - similarity 70% / rating 20% / price-efficiency 10%
 *  - price-efficiency rewards items well under the user's budget
 *    (if any), so cheaper items rank slightly higher when ties exist.
 */
function swiggyScore(
  similarity: number,
  rating: number | null,
  price: number,
  budget: number | null
): number {
  const ratingScore = rating === null ? 0.5 : rating / 5;
  let priceScore = 0.5;
  if (budget && budget > 0) {
    // 1 when item is free, 0 when at or above budget, linear in between.
    priceScore = Math.max(0, 1 - price / budget);
  }
  return 0.7 * similarity + 0.2 * ratingScore + 0.1 * priceScore;
}

// ---------- Seeded path (anonymous demo, unchanged behavior) ----------

async function recommendFromSeed(
  input: string,
  filters: ExtractedFilters,
  filterProvider: "groq" | "regex",
  fellBack: boolean | undefined
) {
  const items = await getMenuItems({ ...filters, limit: 50, offset: 0 });

  let queryEmbedding: number[] | null = null;
  let embeddingProvider = "none";
  try {
    const provider = getEmbeddingsProvider();
    embeddingProvider = provider.name;
    queryEmbedding = await provider.embed(input);
  } catch (err) {
    console.warn("Embeddings provider unavailable, falling back:", (err as Error).message);
  }

  const scored = items.map((item) => {
    const itemEmbedding = coerceEmbedding(item.embedding);
    const similarity =
      queryEmbedding && itemEmbedding
        ? cosineSimilarity(queryEmbedding, itemEmbedding)
        : 0;
    const score = seededScore(similarity, item.protein, item.rating);
    return {
      ...item,
      embedding: undefined,
      similarity: queryEmbedding && itemEmbedding ? similarity : null,
      score,
    };
  });

  const ranked = scored.sort((a, b) => b.score - a.score).slice(0, 10);

  // Generation (G in RAG) — turn the ranked list into a narrative.
  const synthesis = await synthesize({
    query: input,
    filters,
    items: ranked.map((it) => ({
      name: it.itemName,
      restaurantName: it.restaurantName,
      priceInr: Number(it.price),
      rating: it.rating != null ? Number(it.rating) : null,
      proteinG: it.protein,
      caloriesKcal: it.calories,
      similarity: it.similarity,
    })),
  });

  // Attach per-item rationale so the frontend can render it inline.
  const withRationales = ranked.map((it, i) => ({
    ...it,
    rationale: synthesis.rationales[i] || undefined,
  }));

  return {
    source: "seed" as const,
    provider: embeddingProvider,
    filterProvider,
    ...(fellBack ? { filterProviderFellBack: true } : {}),
    synthesis: synthesis.provider !== "none" || synthesis.summary
      ? { summary: synthesis.summary, provider: synthesis.provider, fellBack: synthesis.fellBack }
      : undefined,
    filters,
    recommendations: withRationales,
  };
}

// ---------- Swiggy path (authenticated user with token) ----------

async function recommendFromSwiggy(
  input: string,
  filters: ExtractedFilters,
  filterProvider: "groq" | "regex",
  fellBack: boolean | undefined,
  accessToken: string
) {
  const client = getSwiggyClient();

  // 1. Resolve user's default delivery address. We pick the first
  //    returned by get_addresses (sorted by last order date per their docs).
  const addresses = await client.getAddresses(accessToken);
  if (addresses.length === 0) {
    return {
      source: "swiggy" as const,
      needsAddress: true as const,
      message:
        "No saved delivery addresses on your Swiggy account. Add one in the Swiggy app and try again.",
      filterProvider,
      filters,
    };
  }
  const addressId = addresses[0].addressId;
  console.log(
    `[chat] using addressId=${addressId} (from ${addresses.length} addresses; first address: ` +
      JSON.stringify(addresses[0]).slice(0, 300) +
      ")"
  );

  // 2. Build a Swiggy-style query. For now, pass the raw user text —
  //    Swiggy's search endpoint handles natural-language queries per
  //    their docs. If quality is poor, we'll escalate to having Groq
  //    extract a cuisine term as a separate field.
  const vegOnly = filters.veg === true || filters.vegan === true;
  const { items: rawItems } = await client.searchMenu(accessToken, {
    addressId,
    query: input,
    vegOnly,
  });

  // Debug: dump the first raw item to see actual Swiggy response shape.
  // Removes the guessing about field names — we can adjust the normalizer
  // in real-client.ts based on what's actually there.
  console.log(
    `[chat] search_menu returned ${rawItems.length} items. First item raw shape: ` +
      JSON.stringify(rawItems[0] ?? null).slice(0, 500)
  );

  // 3. Apply hard filters. Swiggy's own filter set doesn't cover:
  //    - Non-veg-only (their API only offers veg-only or mixed; when
  //      the user names a meat dish we filter veg items out ourselves)
  //    - Vegan (they don't distinguish veg vs vegan at the API level)
  //    - maxPrice ceiling
  //    - Restaurant availability (their agent guidance says only
  //      recommend items from OPEN restaurants; when undefined at the
  //      real client, we let the deep-link show "closed" at click time)
  //    - Item-level availability
  const beforeAvailability = rawItems.length;
  let filtered: SwiggyMenuItem[] = rawItems.filter((it) => {
    if (!it.isAvailable) return false;
    if (it.restaurantAvailability && it.restaurantAvailability !== "OPEN") {
      return false;
    }
    return true;
  });
  const afterAvailability = filtered.length;

  // Veg preference is a strict filter for KhanaDedo (unlike Swiggy's
  // API which returns mixed). If the user named a meat dish, don't
  // rank vegetarian items alongside it just because they share a
  // semantic keyword ("butter" appears in Dal Makhani AND Butter
  // Chicken — but that user wants non-veg, not both).
  if (filters.veg === false) {
    filtered = filtered.filter((it) => it.isVeg === false);
  } else if (filters.veg === true) {
    // Swiggy should have filtered on vegFilter=1, but belt-and-braces.
    filtered = filtered.filter((it) => it.isVeg === true);
  }
  const afterVeg = filtered.length;

  if (filters.vegan) {
    // Swiggy may or may not set isVegan; when undefined, fall back to
    // a description heuristic so we don't return paneer for "vegan".
    filtered = filtered.filter((it) => {
      if (it.isVegan === true) return true;
      if (it.isVegan === false) return false;
      // Heuristic when Swiggy doesn't tell us: drop common dairy/egg signals.
      const text = `${it.name} ${it.description}`.toLowerCase();
      const dairyOrEgg = /\b(paneer|butter|cream|cheese|ghee|milk|curd|yogurt|egg)\b/.test(text);
      const plantFlag = /\b(vegan|plant[-\s]?based|tofu|soy|tempeh)\b/.test(text);
      return plantFlag && !dairyOrEgg;
    });
  }
  const afterVegan = filtered.length;

  if (typeof filters.maxPrice === "number") {
    filtered = filtered.filter((it) => it.price <= filters.maxPrice!);
  }
  const afterPrice = filtered.length;

  console.log(
    `[chat] filter funnel: raw=${beforeAvailability} availability=${afterAvailability} ` +
      `veg=${afterVeg} vegan=${afterVegan} price=${afterPrice}`
  );

  // 4. Semantic ranking over the filtered set.
  let queryEmbedding: number[] | null = null;
  let embeddingProvider = "none";
  try {
    const provider = getEmbeddingsProvider();
    embeddingProvider = provider.name;
    queryEmbedding = await provider.embed(input);
  } catch (err) {
    console.warn("Embeddings provider unavailable:", (err as Error).message);
  }

  const itemEmbeddings = queryEmbedding
    ? await embedItemsConcurrently(filtered.map((it) => `${it.name}. ${it.description}`))
    : [];

  const budget = filters.maxPrice ?? null;
  const scored = filtered.map((item, idx) => {
    const emb = itemEmbeddings[idx];
    const similarity =
      queryEmbedding && emb ? cosineSimilarity(queryEmbedding, emb) : 0;
    const score = swiggyScore(similarity, item.rating ?? null, item.price, budget);
    return {
      itemName: item.name,
      price: item.price.toFixed(2),
      restaurantName: item.restaurantName,
      restaurantId: item.restaurantId,
      rating: item.rating != null ? item.rating.toFixed(1) : null,
      isVeg: item.isVeg,
      isVegan: item.isVegan ?? null,
      description: item.description,
      category: item.category ?? null,
      swiggyUrl: item.swiggyUrl ?? null,
      similarity: queryEmbedding && emb ? similarity : null,
      score,
    };
  });

  const ranked = scored.sort((a, b) => b.score - a.score).slice(0, 10);

  // Generation step for the Swiggy path. Same shape as the seed path.
  const synthesis = await synthesize({
    query: input,
    filters,
    items: ranked.map((it) => ({
      name: it.itemName,
      restaurantName: it.restaurantName,
      priceInr: Number(it.price),
      rating: it.rating != null ? Number(it.rating) : null,
      isVeg: it.isVeg,
      isVegan: it.isVegan ?? undefined,
      description: it.description,
      similarity: it.similarity,
    })),
  });

  const withRationales = ranked.map((it, i) => ({
    ...it,
    rationale: synthesis.rationales[i] || undefined,
  }));

  return {
    source: "swiggy" as const,
    provider: embeddingProvider,
    filterProvider,
    ...(fellBack ? { filterProviderFellBack: true } : {}),
    synthesis: synthesis.provider !== "none" || synthesis.summary
      ? { summary: synthesis.summary, provider: synthesis.provider, fellBack: synthesis.fellBack }
      : undefined,
    filters,
    addressLabel: addresses[0].label,
    recommendations: withRationales,
  };
}

/**
 * Embed multiple texts concurrently. Transformers.js is per-process
 * single-threaded for inference, so concurrency doesn't actually help
 * — but Promise.all keeps the code clean and is correct if we later
 * swap in a multi-thread or remote embedder.
 */
async function embedItemsConcurrently(texts: string[]): Promise<(number[] | null)[]> {
  const provider = getEmbeddingsProvider();
  return Promise.all(
    texts.map(async (t) => {
      try {
        return await provider.embed(t);
      } catch {
        return null;
      }
    })
  );
}

// ---------- Main entry point ----------

export async function getRecommendationsFromText(
  input: string,
  kdUserId?: string
) {
  // 1. Extract structured filters (Groq or regex).
  const { filters, provider: filterProvider, fellBack } = await extractFilters(input);

  // 2. Route based on user identity. Anonymous callers and logged-in
  //    users without a Swiggy token both hit the seeded path. Only
  //    callers WITH a stored Swiggy token go through the MCP client.
  let swiggyToken: string | null = null;
  if (kdUserId) {
    const stored = await getToken(kdUserId);
    swiggyToken = stored?.accessToken ?? null;
  }

  if (swiggyToken) {
    try {
      return await recommendFromSwiggy(input, filters, filterProvider, fellBack, swiggyToken);
    } catch (err) {
      // If the Swiggy path fails (network, 401, etc.) we fall back to
      // the seed path so the user still sees something useful, with a
      // note explaining the degradation.
      console.warn("Swiggy path failed, falling back to seed:", (err as Error).message);
      const result = await recommendFromSeed(input, filters, filterProvider, fellBack);
      return { ...result, swiggyError: (err as Error).message };
    }
  }

  return recommendFromSeed(input, filters, filterProvider, fellBack);
}
