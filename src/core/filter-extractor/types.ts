export type ExtractedFilters = {
  city?: string;
  veg?: boolean;
  maxPrice?: number;
  minProtein?: number;
};

export type FilterExtractionResult = {
  filters: ExtractedFilters;
  /** Which provider produced the result ("groq" or "regex"). */
  provider: "groq" | "regex";
  /** True when the requested provider failed and we fell back to regex. */
  fellBack?: boolean;
};
