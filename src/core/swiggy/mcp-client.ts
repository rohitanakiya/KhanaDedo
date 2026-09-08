/**
 * SwiggyClient — the contract between chat.service and the underlying
 * MCP server. Two implementations exist:
 *
 *   - MockSwiggyClient: returns realistic data without making network
 *     calls. Used in dev, in tests, and in production while we wait
 *     for Builders Club approval.
 *
 *   - RealSwiggyClient: calls https://mcp.swiggy.com/food with the
 *     user's bearer token. Activated by setting SWIGGY_PROVIDER=real
 *     once we have approved access.
 *
 * The token is passed per-call (not stored in the client instance)
 * so the same instance can serve different users — request-scoped
 * delegation, not application-scoped.
 */

import type {
  SwiggyAddress,
  SwiggyPaginatedItems,
  SwiggyPaginatedRestaurants,
  SwiggyRestaurantMenu,
} from "./types";

export interface SearchMenuArgs {
  addressId: string;
  query: string;
  /** True restricts to veg items. Swiggy has no non-veg-only filter. */
  vegOnly?: boolean;
  restaurantId?: string;
  offset?: number;
}

export interface SearchRestaurantsArgs {
  addressId: string;
  query: string;
  offset?: number;
}

export interface GetRestaurantMenuArgs {
  addressId: string;
  restaurantId: string;
  page?: number;
  pageSize?: number;
}

export interface AddToCartArgs {
  /** Which of the user's Swiggy addresses to attach the cart to. */
  addressId: string;
  /** Restaurant the item belongs to. */
  restaurantId: string;
  restaurantName?: string;
  /** Items to add. For MVP we send one at a time. */
  cartItems: Array<{
    menu_item_id: string;
    quantity: number;
    /** Not yet plumbed through from search_menu — treated as best-effort. */
    variants?: unknown[];
    variantsV2?: unknown[];
    addons?: unknown[];
  }>;
}

/** Raw response from update_food_cart. We forward the salient bits to
 *  the frontend so it can decide whether to open Swiggy checkout or
 *  tell the user the item needs customization. */
export interface AddToCartResult {
  ok: boolean;
  /** Message from Swiggy (success confirmation or error string). */
  message?: string;
  /** Present when Swiggy returned an error — usually about missing
   *  required variants/addons that the user has to pick themselves. */
  errorMessage?: string;
}

export interface SwiggyClient {
  /** No args — Swiggy infers user from the bearer token. */
  getAddresses(accessToken: string): Promise<SwiggyAddress[]>;

  searchRestaurants(
    accessToken: string,
    args: SearchRestaurantsArgs
  ): Promise<SwiggyPaginatedRestaurants>;

  searchMenu(
    accessToken: string,
    args: SearchMenuArgs
  ): Promise<SwiggyPaginatedItems>;

  getRestaurantMenu(
    accessToken: string,
    args: GetRestaurantMenuArgs
  ): Promise<SwiggyRestaurantMenu>;

  addToCart(
    accessToken: string,
    args: AddToCartArgs
  ): Promise<AddToCartResult>;
}

export class SwiggyClientError extends Error {
  constructor(
    message: string,
    public status?: number,
    public swiggyMessage?: string
  ) {
    super(message);
    this.name = "SwiggyClientError";
  }
}
