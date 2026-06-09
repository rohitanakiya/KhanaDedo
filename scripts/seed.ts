/**
 * Seed sample restaurants and menu items for development.
 *
 * Idempotent: relies on UNIQUE(name, city) for restaurants and
 * UNIQUE(restaurant_id, name) for menu_items, with ON CONFLICT
 * DO UPDATE so re-runs refresh data instead of erroring.
 *
 * Usage:  npm run db:seed
 *
 * After seeding, run `npm run embeddings:generate` to populate the
 * embedding column so /chat/recommend can rank by similarity.
 */

import dotenv from "dotenv";
dotenv.config();

import pool from "../src/core/db";

type RestaurantSeed = {
  name: string;
  city: string;
  rating: number;
  items: MenuItemSeed[];
};

type MenuItemSeed = {
  name: string;
  price: number;
  veg: boolean;
  /**
   * True only if the dish has zero animal products (no dairy, no eggs,
   * no honey). Every vegan item is veg, but the inverse is not true.
   */
  vegan: boolean;
  protein: number;
  calories: number;
  description: string;
};

const RESTAURANTS: RestaurantSeed[] = [
  {
    name: "Protein House",
    city: "Bangalore",
    rating: 4.6,
    items: [
      {
        name: "Grilled Chicken Bowl",
        price: 320,
        veg: false,
        vegan: false,
        protein: 45,
        calories: 520,
        description:
          "Lean grilled chicken breast with brown rice, steamed broccoli and a light yogurt sauce. High protein, moderate carbs, low fat.",
      },
      {
        name: "Paneer Tikka Bowl",
        price: 280,
        veg: true,
        vegan: false,
        protein: 32,
        calories: 580,
        description:
          "Tandoor-grilled paneer cubes with quinoa, bell peppers and mint chutney. Vegetarian high-protein meal good for muscle gain. Contains dairy.",
      },
      {
        name: "Egg White Omelette",
        price: 180,
        veg: false,
        vegan: false,
        protein: 28,
        calories: 240,
        description:
          "Six egg whites whisked with spinach, mushrooms and oregano. Light breakfast option, very low calorie and high protein.",
      },
      {
        name: "Soy Chaap Wrap",
        price: 220,
        veg: true,
        vegan: true,
        protein: 30,
        calories: 480,
        description:
          "Plant-based soy chaap in a whole wheat wrap with hummus and pickled onions. High-protein vegan option, no dairy or eggs.",
      },
    ],
  },
  {
    name: "Green Bowl Co",
    city: "Bangalore",
    rating: 4.3,
    items: [
      {
        name: "Quinoa Buddha Bowl",
        price: 260,
        veg: true,
        vegan: true,
        protein: 18,
        calories: 450,
        description:
          "Quinoa with roasted chickpeas, avocado, kale and tahini dressing. Light, filling, balanced. Fully plant-based, good for cutting.",
      },
      {
        name: "Sprout Salad",
        price: 150,
        veg: true,
        vegan: true,
        protein: 14,
        calories: 220,
        description:
          "Mixed sprouts with cucumber, tomato and lemon dressing. Cheap, low calorie, fresh, crunchy, fully plant-based.",
      },
      {
        name: "Tofu Stir Fry",
        price: 240,
        veg: true,
        vegan: true,
        protein: 22,
        calories: 380,
        description:
          "Pan-tossed tofu with bok choy, ginger and soy. Plant-based, moderate protein, light dinner option.",
      },
    ],
  },
  {
    name: "Tandoor Express",
    city: "Mumbai",
    rating: 4.1,
    items: [
      {
        name: "Butter Chicken",
        price: 380,
        veg: false,
        vegan: false,
        protein: 38,
        calories: 720,
        description:
          "Classic North Indian butter chicken in creamy tomato gravy. Rich, indulgent, high calorie.",
      },
      {
        name: "Dal Makhani",
        price: 220,
        veg: true,
        vegan: false,
        protein: 16,
        calories: 480,
        description:
          "Slow-cooked black lentils with butter and cream. Comfort food, vegetarian (contains dairy), moderate protein.",
      },
      {
        name: "Tandoori Roti",
        price: 40,
        veg: true,
        vegan: true,
        protein: 6,
        calories: 180,
        description:
          "Whole wheat flatbread baked in tandoor. Cheap side. No dairy, no eggs.",
      },
      {
        name: "Chicken Seekh Kebab",
        price: 290,
        veg: false,
        vegan: false,
        protein: 36,
        calories: 410,
        description:
          "Minced chicken kebabs grilled on skewers with onions and mint chutney. High protein, moderate calorie.",
      },
    ],
  },
  {
    name: "Healthy Hyderabad",
    city: "Hyderabad",
    rating: 4.4,
    items: [
      {
        name: "Hyderabadi Biryani",
        price: 300,
        veg: false,
        vegan: false,
        protein: 28,
        calories: 780,
        description:
          "Aromatic basmati rice layered with marinated chicken and saffron. Filling, indulgent, popular dinner.",
      },
      {
        name: "Veg Pulao",
        price: 200,
        veg: true,
        vegan: false,
        protein: 10,
        calories: 520,
        description:
          "Mildly spiced rice with peas, carrots and beans, cooked in ghee. Vegetarian, budget option.",
      },
      {
        name: "Mirchi Ka Salan",
        price: 180,
        veg: true,
        vegan: true,
        protein: 8,
        calories: 320,
        description:
          "Tangy peanut-sesame curry with green chillies. Side dish, plant-based, no dairy.",
      },
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const r of RESTAURANTS) {
      const restaurantResult = await client.query<{ id: string }>(
        `
        INSERT INTO restaurants (name, city, rating)
        VALUES ($1, $2, $3)
        ON CONFLICT (name, city) DO UPDATE SET rating = EXCLUDED.rating
        RETURNING id
        `,
        [r.name, r.city, r.rating]
      );
      const restaurantId = restaurantResult.rows[0].id;

      for (const item of r.items) {
        await client.query(
          `
          INSERT INTO menu_items
            (restaurant_id, name, price, veg, vegan, protein, calories, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (restaurant_id, name) DO UPDATE SET
            price = EXCLUDED.price,
            veg = EXCLUDED.veg,
            vegan = EXCLUDED.vegan,
            protein = EXCLUDED.protein,
            calories = EXCLUDED.calories,
            description = EXCLUDED.description
          `,
          [
            restaurantId,
            item.name,
            item.price,
            item.veg,
            item.vegan,
            item.protein,
            item.calories,
            item.description,
          ]
        );
      }
      console.log(`  OK ${r.name} (${r.city}) - ${r.items.length} items`);
    }

    await client.query("COMMIT");
    console.log("Seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
