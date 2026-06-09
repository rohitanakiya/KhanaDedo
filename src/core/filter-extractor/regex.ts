/**
 * Rule-based filter extractor.
 *
 * Reliable for the known patterns ("cheap", "veg", "X grams protein",
 * "under N rupees", named cities, "vegan" synonyms) and the default
 * when GROQ_API_KEY is not configured. Also the fallback when the
 * Groq provider errors.
 */

import type { ExtractedFilters } from "./types";

function extractVegan(input: string): boolean | undefined {
  const text = input.toLowerCase();

  // Strict vegan signals
  if (/\b(vegan|plant[-\s]?only|no dairy and no egg|dairy[-\s]?free vegan)\b/.test(text)) {
    return true;
  }

  return undefined;
}

function extractVegFilter(input: string): boolean | undefined {
  const text = input.toLowerCase();

  if (/\b(non[-\s]?veg|chicken|mutton|meat|fish|egg)\b/.test(text)) {
    return false;
  }

  if (/\b(veg|vegetarian|plant[-\s]?based|vegan)\b/.test(text)) {
    return true;
  }

  return undefined;
}

function extractCity(input: string): string | undefined {
  const text = input.toLowerCase();

  const cityMap: Record<string, string> = {
    bengaluru: "bangalore",
  };

  const knownCities = [
    "bangalore",
    "bengaluru",
    "mumbai",
    "delhi",
    "pune",
    "hyderabad",
    "chennai",
    "kolkata",
  ];

  for (const city of knownCities) {
    if (text.includes(city)) {
      return cityMap[city] ?? city;
    }
  }

  return undefined;
}

function extractMaxPrice(input: string): number | undefined {
  const text = input.toLowerCase();

  const contextualMatch = text.match(
    /\b(?:under|below|less than|max|maximum|up to|upto)\s*(?:rs\.?|inr|\$)?\s*(\d+(?:\.\d+)?)\b/
  );
  if (contextualMatch) return Number(contextualMatch[1]);

  const priceMatch = text.match(
    /\b(?:price|budget)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\b/
  );
  if (priceMatch) return Number(priceMatch[1]);

  if (/\b(cheap|affordable|budget)\b/.test(text)) return 300;

  return undefined;
}

function extractMinProtein(input: string): number | undefined {
  const text = input.toLowerCase();

  const contextualMatch = text.match(
    /\b(?:at least|min|minimum|more than|above)\s*(\d+(?:\.\d+)?)\s*g?\s*protein\b/
  );
  if (contextualMatch) return Number(contextualMatch[1]);

  const genericMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s*g?\s*protein\b/
  );
  if (genericMatch) return Number(genericMatch[1]);

  if (/\b(high protein|protein[-\s]?rich|rich in protein)\b/.test(text)) {
    return 20;
  }

  return undefined;
}

export function extractWithRegex(input: string): ExtractedFilters {
  const vegan = extractVegan(input);
  // If user said vegan, that implies veg=true too (every vegan dish is veg)
  const veg = vegan === true ? true : extractVegFilter(input);

  const raw: ExtractedFilters = {
    city: extractCity(input),
    veg,
    vegan,
    maxPrice: extractMaxPrice(input),
    minProtein: extractMinProtein(input),
  };

  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined)
  ) as ExtractedFilters;
}
