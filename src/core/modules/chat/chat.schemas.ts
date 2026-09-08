import { z } from "zod";

export const recommendSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "text is required")
    .max(500, "text is too long (max 500 characters)"),
  /** Optional: which of the user's Swiggy addresses to search around.
   *  When omitted the backend picks the first address returned by Swiggy
   *  (Swiggy sorts them by recency). Ignored on the seed path. */
  addressId: z.string().trim().min(1).max(100).optional(),
});

export type RecommendInput = z.infer<typeof recommendSchema>;
