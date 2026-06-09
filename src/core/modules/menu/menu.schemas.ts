import { z } from "zod";

/**
 * Query strings always arrive as strings, so we use z.coerce to accept
 * "true"/"false" and numeric strings and turn them into the right types.
 */
export const menuQuerySchema = z.object({
  city: z.string().trim().min(1).optional(),

  veg: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),

  vegan: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),

  minProtein: z.coerce
    .number()
    .nonnegative("minProtein must be >= 0")
    .optional(),

  maxPrice: z.coerce
    .number()
    .nonnegative("maxPrice must be >= 0")
    .optional(),

  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100, "limit cannot exceed 100")
    .optional(),

  offset: z.coerce.number().int().nonnegative().optional(),
});

export type MenuQuery = z.infer<typeof menuQuerySchema>;
