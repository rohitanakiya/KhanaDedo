export type ExtractedFilters = {
  city?: string;
  veg?: boolean;
  vegan?: boolean;
  maxPrice?: number;
  minProtein?: number;
  /** A concrete, keyword-friendly Swiggy search term derived from the
   *  user's intent. Swiggy's `search_menu` is a keyword matcher, not
   *  semantic, so raw queries like "light food" or "comfort meal"
   *  return junk. Groq translates them to something Swiggy can find:
   *  "light food" -> "salad", "comfort food" -> "biryani", "quick
   *  snack" -> "sandwich". Chat.service uses this in place of the
   *  raw text when present. Omitted when the raw query is already
   *  concrete (e.g. "chicken biryani"). */
  swiggyQuery?: string;
};

export type FilterExtractionResult = {
  filters: ExtractedFilters;
  /** Which provider produced the result ("groq" or "regex"). */
  provider: "groq" | "regex";
  /** True when the requested provider failed and we fell back to regex. */
  fellBack?: boolean;
};
