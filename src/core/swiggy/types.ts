/**
 * Normalized shapes our orchestrator consumes.
 *
 * Mock and real clients both return data in these shapes; the real
 * client does the work of mapping Swiggy's actual response fields
 * into this normalized form so chat.service doesn't care which
 * client is in play.
 */

export interface SwiggyAddress {
  addressId: string;
  label: string;          // "Home", "Work", or user-set
  formattedAddress: string;
  city: string;
  // No lat/lng — Swiggy intentionally omits coordinates per their docs.
}

export interface SwiggyRestaurant {
  restaurantId: string;
  name: string;
  cuisines: string[];
  rating: number | null;
  availabilityStatus: "OPEN" | "CLOSED" | "UNAVAILABLE";
  distanceKm: number;
  etaMins: number | null;
  costForTwo: number | null;
  imageUrl: string | null;
}

export interface SwiggyMenuItem {
  itemId: string;
  name: string;
  description: string;
  price: number;          // INR, after any item-level discount
  restaurantId: string;
  restaurantName: string;
  isVeg: boolean;
  /**
   * True when we know the item is vegan (no animal products). Swiggy
   * does not always provide this; the real client may leave it undefined
   * when uncertain, in which case the orchestrator falls back to
   * inferring from name+description via the embedding step.
   */
  isVegan?: boolean;
  rating?: number;
  imageUrl?: string;
  category?: string;
  /**
   * Swiggy's availability for THIS item (e.g. out of stock). Independent
   * of the restaurant's overall availabilityStatus.
   */
  isAvailable: boolean;
  /**
   * Parent restaurant's availability. Populated by the mock; may be
   * undefined in the real client if search_menu doesn't include it
   * — in that case the orchestrator falls back to trusting the deep
   * link (Swiggy shows "closed" at click time).
   */
  restaurantAvailability?: "OPEN" | "CLOSED" | "UNAVAILABLE";
  /** Deep-link URL to open the item on Swiggy app/web for checkout. */
  swiggyUrl?: string;
}

export interface SwiggyPaginatedRestaurants {
  restaurants: SwiggyRestaurant[];
  nextOffset: number | null;
}

export interface SwiggyPaginatedItems {
  items: SwiggyMenuItem[];
  nextOffset: number | null;
}

export interface SwiggyRestaurantMenu {
  restaurantId: string;
  restaurantName: string;
  categories: Array<{
    name: string;
    items: SwiggyMenuItem[];
  }>;
  hasMore: boolean;
}
