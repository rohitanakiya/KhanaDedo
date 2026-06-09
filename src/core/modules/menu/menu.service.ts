import pool from "../../db";

type MenuFilters = {
  city?: string;
  veg?: boolean;
  vegan?: boolean;
  minProtein?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
};

type MenuItemRow = {
  itemName: string;
  price: number;
  protein: number;
  calories: number;
  restaurantName: string;
  rating: number | null;
  embedding: number[] | null;
};

export async function getMenuItems(filters: MenuFilters): Promise<MenuItemRow[]> {
  const conditions: string[] = [];
  const values: Array<string | number | boolean> = [];

  if (filters.city !== undefined) {
    values.push(filters.city);
    conditions.push(`LOWER(r.city) = LOWER($${values.length})`);
  }

  if (filters.veg !== undefined) {
    values.push(filters.veg);
    conditions.push(`m.veg = $${values.length}`);
  }

  if (filters.vegan !== undefined) {
    values.push(filters.vegan);
    conditions.push(`m.vegan = $${values.length}`);
  }

  if (filters.minProtein !== undefined) {
    values.push(filters.minProtein);
    conditions.push(`m.protein >= $${values.length}`);
  }

  if (filters.maxPrice !== undefined) {
    values.push(filters.maxPrice);
    conditions.push(`m.price <= $${values.length}`);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  values.push(limit, offset);

  const query = `
    SELECT
      m.name AS "itemName",
      m.price,
      m.protein,
      m.calories,
      r.name AS "restaurantName",
      r.rating,
      m.embedding
    FROM menu_items m
    INNER JOIN restaurants r ON r.id = m.restaurant_id
    ${whereClause}
    ORDER BY r.rating DESC NULLS LAST, m.name ASC
    LIMIT $${values.length - 1}
    OFFSET $${values.length}
  `;

  const result = await pool.query<MenuItemRow>(query, values);
  return result.rows;
}
