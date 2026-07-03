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
