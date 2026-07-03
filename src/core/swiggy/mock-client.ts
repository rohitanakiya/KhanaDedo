/**
 * Mock SwiggyClient.
 *
 * Returns deterministic-ish realistic data so we can develop the
 * orchestrator end-to-end without live MCP access. Shapes match the
 * real client; chat.service can't tell which is in play.
 *
 * Mocked dataset spans:
 *   - 5 restaurants (mix open/closed)
 *   - 16 menu items (mix veg/vegan/non-veg, ₹120-₹520 spread)
 *   - 2 saved addresses (Home + Work)
 *
 * Query handling: returns items whose name+description loosely contain
 * any token of the query (case-insensitive). Empty query returns all
 * items. Pagination via offset.
 */

import type {
  SearchMenuArgs,
  SearchRestaurantsArgs,
  GetRestaurantMenuArgs,
  SwiggyClient,
} from "./mcp-client";
import type {
  SwiggyAddress,
  SwiggyMenuItem,
  SwiggyPaginatedItems,
  SwiggyPaginatedRestaurants,
  SwiggyRestaurant,
  SwiggyRestaurantMenu,
} from "./types";

const RESTAURANTS: SwiggyRestaurant[] = [
  {
    restaurantId: "rest_proteinhouse",
    name: "Protein House",
    cuisines: ["Healthy", "Bowls", "Indian"],
    rating: 4.6,
    availabilityStatus: "OPEN",
    distanceKm: 1.8,
    etaMins: 28,
    costForTwo: 450,
    imageUrl: null,
  },
  {
    restaurantId: "rest_greenbowl",
    name: "Green Bowl Co",
    cuisines: ["Salad", "Vegan", "Continental"],
    rating: 4.3,
    availabilityStatus: "OPEN",
    distanceKm: 3.4,
    etaMins: 38,
    costForTwo: 400,
    imageUrl: null,
  },
  {
    restaurantId: "rest_tandoor",
    name: "Tandoor Express",
    cuisines: ["North Indian", "Mughlai"],
    rating: 4.1,
    availabilityStatus: "OPEN",
    distanceKm: 2.6,
    etaMins: 32,
    costForTwo: 500,
    imageUrl: null,
  },
  {
    restaurantId: "rest_hyderabad",
    name: "Healthy Hyderabad",
    cuisines: ["Hyderabadi", "Biryani", "South Indian"],
    rating: 4.4,
    availabilityStatus: "OPEN",
    distanceKm: 4.1,
    etaMins: 42,
    costForTwo: 550,
    imageUrl: null,
  },
  {
    restaurantId: "rest_nightowl",
    name: "Night Owl Diner",
    cuisines: ["American", "Burgers"],
    rating: 3.9,
    availabilityStatus: "CLOSED",
    distanceKm: 6.2,
    etaMins: null,
    costForTwo: 600,
    imageUrl: null,
  },
];

function restaurantName(id: string): string {
  return RESTAURANTS.find((r) => r.restaurantId === id)?.name ?? "Unknown";
}

function restaurantAvailability(id: string): "OPEN" | "CLOSED" | "UNAVAILABLE" | undefined {
  return RESTAURANTS.find((r) => r.restaurantId === id)?.availabilityStatus;
}

/**
 * Wraps a raw item with its parent restaurant's availability status,
 * so the orchestrator can drop items from closed restaurants.
 */
function withRestaurantAvailability(item: SwiggyMenuItem): SwiggyMenuItem {
  return {
    ...item,
    restaurantAvailability: restaurantAvailability(item.restaurantId),
  };
}

const ITEMS: SwiggyMenuItem[] = [
  // Protein House
  {
    itemId: "item_grilled_chicken_bowl",
    name: "Grilled Chicken Bowl",
    description: "Lean grilled chicken with brown rice, broccoli and yogurt dip. High protein.",
    price: 320,
    restaurantId: "rest_proteinhouse",
    restaurantName: restaurantName("rest_proteinhouse"),
    isVeg: false,
    isVegan: false,
    rating: 4.6,
    category: "Bowls",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/protein-house?item=grilled-chicken-bowl",
  },
  {
    itemId: "item_paneer_tikka_bowl",
    name: "Paneer Tikka Bowl",
    description: "Tandoor-grilled paneer with quinoa, bell peppers, mint chutney. Vegetarian, contains dairy.",
    price: 280,
    restaurantId: "rest_proteinhouse",
    restaurantName: restaurantName("rest_proteinhouse"),
    isVeg: true,
    isVegan: false,
    rating: 4.6,
    category: "Bowls",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/protein-house?item=paneer-tikka-bowl",
  },
  {
    itemId: "item_egg_white_omelette",
    name: "Egg White Omelette",
    description: "Six egg whites with spinach, mushrooms and oregano. Low calorie, high protein.",
    price: 180,
    restaurantId: "rest_proteinhouse",
    restaurantName: restaurantName("rest_proteinhouse"),
    isVeg: false,
    isVegan: false,
    rating: 4.6,
    category: "Breakfast",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/protein-house?item=egg-white-omelette",
  },
  {
    itemId: "item_soy_chaap_wrap",
    name: "Soy Chaap Wrap",
    description: "Plant-based soy chaap in whole wheat wrap with hummus, pickled onions. Vegan, no dairy.",
    price: 220,
    restaurantId: "rest_proteinhouse",
    restaurantName: restaurantName("rest_proteinhouse"),
    isVeg: true,
    isVegan: true,
    rating: 4.6,
    category: "Wraps",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/protein-house?item=soy-chaap-wrap",
  },

  // Green Bowl Co
  {
    itemId: "item_quinoa_buddha_bowl",
    name: "Quinoa Buddha Bowl",
    description: "Quinoa, chickpeas, avocado, kale, tahini dressing. Plant-based, balanced.",
    price: 260,
    restaurantId: "rest_greenbowl",
    restaurantName: restaurantName("rest_greenbowl"),
    isVeg: true,
    isVegan: true,
    rating: 4.3,
    category: "Bowls",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/green-bowl-co?item=quinoa-buddha-bowl",
  },
  {
    itemId: "item_sprout_salad",
    name: "Sprout Salad",
    description: "Mixed sprouts with cucumber, tomato, lemon dressing. Cheap, low calorie, plant-based.",
    price: 150,
    restaurantId: "rest_greenbowl",
    restaurantName: restaurantName("rest_greenbowl"),
    isVeg: true,
    isVegan: true,
    rating: 4.3,
    category: "Salads",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/green-bowl-co?item=sprout-salad",
  },
  {
    itemId: "item_tofu_stir_fry",
    name: "Tofu Stir Fry",
    description: "Pan-tossed tofu, bok choy, ginger, soy. Plant-based, light dinner.",
    price: 240,
    restaurantId: "rest_greenbowl",
    restaurantName: restaurantName("rest_greenbowl"),
    isVeg: true,
    isVegan: true,
    rating: 4.3,
    category: "Mains",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/green-bowl-co?item=tofu-stir-fry",
  },

  // Tandoor Express
  {
    itemId: "item_butter_chicken",
    name: "Butter Chicken",
    description: "Classic butter chicken in creamy tomato gravy. Rich, indulgent.",
    price: 380,
    restaurantId: "rest_tandoor",
    restaurantName: restaurantName("rest_tandoor"),
    isVeg: false,
    isVegan: false,
    rating: 4.1,
    category: "Mains",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/tandoor-express?item=butter-chicken",
  },
  {
    itemId: "item_dal_makhani",
    name: "Dal Makhani",
    description: "Slow-cooked black lentils with butter and cream. Vegetarian, contains dairy.",
    price: 220,
    restaurantId: "rest_tandoor",
    restaurantName: restaurantName("rest_tandoor"),
    isVeg: true,
    isVegan: false,
    rating: 4.1,
    category: "Mains",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/tandoor-express?item=dal-makhani",
  },
  {
    itemId: "item_tandoori_roti",
    name: "Tandoori Roti",
    description: "Whole wheat flatbread baked in tandoor. Cheap side, plant-based.",
    price: 40,
    restaurantId: "rest_tandoor",
    restaurantName: restaurantName("rest_tandoor"),
    isVeg: true,
    isVegan: true,
    rating: 4.1,
    category: "Breads",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/tandoor-express?item=tandoori-roti",
  },
  {
    itemId: "item_chicken_seekh_kebab",
    name: "Chicken Seekh Kebab",
    description: "Minced chicken kebabs grilled on skewers with mint chutney. High protein.",
    price: 290,
    restaurantId: "rest_tandoor",
    restaurantName: restaurantName("rest_tandoor"),
    isVeg: false,
    isVegan: false,
    rating: 4.1,
    category: "Starters",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/tandoor-express?item=chicken-seekh-kebab",
  },

  // Healthy Hyderabad
  {
    itemId: "item_hyderabadi_biryani",
    name: "Hyderabadi Biryani",
    description: "Aromatic basmati rice layered with marinated chicken and saffron. Filling.",
    price: 300,
    restaurantId: "rest_hyderabad",
    restaurantName: restaurantName("rest_hyderabad"),
    isVeg: false,
    isVegan: false,
    rating: 4.4,
    category: "Biryani",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/healthy-hyderabad?item=hyderabadi-biryani",
  },
  {
    itemId: "item_veg_pulao",
    name: "Veg Pulao",
    description: "Mildly spiced rice with peas, carrots, beans, cooked in ghee. Vegetarian.",
    price: 200,
    restaurantId: "rest_hyderabad",
    restaurantName: restaurantName("rest_hyderabad"),
    isVeg: true,
    isVegan: false,
    rating: 4.4,
    category: "Rice",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/healthy-hyderabad?item=veg-pulao",
  },
  {
    itemId: "item_mirchi_ka_salan",
    name: "Mirchi Ka Salan",
    description: "Tangy peanut-sesame curry with green chillies. Plant-based, no dairy.",
    price: 180,
    restaurantId: "rest_hyderabad",
    restaurantName: restaurantName("rest_hyderabad"),
    isVeg: true,
    isVegan: true,
    rating: 4.4,
    category: "Curries",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/healthy-hyderabad?item=mirchi-ka-salan",
  },

  // Night Owl Diner (CLOSED — should be filtered out by orchestrator)
  {
    itemId: "item_classic_burger",
    name: "Classic Cheeseburger",
    description: "Beef patty, cheddar, lettuce, special sauce. American diner classic.",
    price: 320,
    restaurantId: "rest_nightowl",
    restaurantName: restaurantName("rest_nightowl"),
    isVeg: false,
    isVegan: false,
    rating: 3.9,
    category: "Burgers",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/night-owl-diner?item=classic-cheeseburger",
  },
  {
    itemId: "item_loaded_fries",
    name: "Loaded Fries",
    description: "Crispy fries with cheese sauce, jalapenos, sour cream. Indulgent.",
    price: 220,
    restaurantId: "rest_nightowl",
    restaurantName: restaurantName("rest_nightowl"),
    isVeg: true,
    isVegan: false,
    rating: 3.9,
    category: "Sides",
    isAvailable: true,
    swiggyUrl: "https://www.swiggy.com/restaurant/night-owl-diner?item=loaded-fries",
  },
];

const ADDRESSES: SwiggyAddress[] = [
  {
    addressId: "addr_home",
    label: "Home",
    formattedAddress: "Flat 302, Cypress Heights, HSR Layout Sector 2",
    city: "Bangalore",
  },
  {
    addressId: "addr_work",
    label: "Work",
    formattedAddress: "Ground floor, Diamond Tower, Koramangala 4th Block",
    city: "Bangalore",
  },
];

function matchesQuery(item: SwiggyMenuItem, query: string): boolean {
  if (!query.trim()) return true;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${item.name} ${item.description} ${item.category ?? ""}`.toLowerCase();
  // Match if ANY token appears — mirrors a permissive search.
  return tokens.some((t) => haystack.includes(t));
}

export class MockSwiggyClient implements SwiggyClient {
  async getAddresses(_token: string): Promise<SwiggyAddress[]> {
    return [...ADDRESSES];
  }

  async searchRestaurants(
    _token: string,
    args: SearchRestaurantsArgs
  ): Promise<SwiggyPaginatedRestaurants> {
    const filtered = RESTAURANTS.filter((r) => {
      if (!args.query.trim()) return true;
      const q = args.query.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.cuisines.some((c) => c.toLowerCase().includes(q))
      );
    });
    return { restaurants: filtered, nextOffset: null };
  }

  async searchMenu(
    _token: string,
    args: SearchMenuArgs
  ): Promise<SwiggyPaginatedItems> {
    let matches = ITEMS.filter((item) => matchesQuery(item, args.query));

    if (args.vegOnly) {
      matches = matches.filter((i) => i.isVeg);
    }

    if (args.restaurantId) {
      matches = matches.filter((i) => i.restaurantId === args.restaurantId);
    }

    return {
      items: matches.map(withRestaurantAvailability),
      nextOffset: null,
    };
  }

  async getRestaurantMenu(
    _token: string,
    args: GetRestaurantMenuArgs
  ): Promise<SwiggyRestaurantMenu> {
    const restaurant = RESTAURANTS.find((r) => r.restaurantId === args.restaurantId);
    if (!restaurant) {
      return {
        restaurantId: args.restaurantId,
        restaurantName: "Unknown",
        categories: [],
        hasMore: false,
      };
    }

    const items = ITEMS.filter((i) => i.restaurantId === args.restaurantId);
    const byCategory = new Map<string, SwiggyMenuItem[]>();
    for (const item of items) {
      const cat = item.category ?? "Mains";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(item);
    }

    return {
      restaurantId: args.restaurantId,
      restaurantName: restaurant.name,
      categories: Array.from(byCategory.entries()).map(([name, items]) => ({
        name,
        items: items.map(withRestaurantAvailability),
      })),
      hasMore: false,
    };
  }
}
