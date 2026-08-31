/**
 * Live SwiggyClient that calls https://mcp.swiggy.com/food.
 *
 * The MCP server uses JSON-RPC 2.0 over a single HTTP endpoint per
 * vertical (Food / Instamart / Dineout). Tool dispatch happens via
 * the `tools/call` method with `name` and `arguments`.
 *
 * Currently only searchMenu is fully wired — it's the primary path
 * for v1 KhanaDedo. Other methods throw "not implemented" until
 * we have approval to test E2E. The response-shape normalization in
 * searchMenu shows the pattern; the others follow it once we have
 * live data to verify against.
 */

import { SwiggyClient, SwiggyClientError, SearchMenuArgs, SearchRestaurantsArgs, GetRestaurantMenuArgs } from "./mcp-client";
import type {
  SwiggyAddress,
  SwiggyMenuItem,
  SwiggyPaginatedItems,
  SwiggyPaginatedRestaurants,
  SwiggyRestaurantMenu,
} from "./types";

const BASE_URL = "https://mcp.swiggy.com";
const FOOD_ENDPOINT = `${BASE_URL}/food`;
const TIMEOUT_MS = 15_000;

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number;
  result: { content: Array<{ type: string; text: string }> } | T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

/**
 * Swiggy MCP wraps every tool response in:
 *   { success: true, data: { ... }, message?: "..." }
 * or { success: false, error: { message: "..." } }
 *
 * MCP itself wraps THAT in JSON-RPC. So we unwrap twice.
 */
interface SwiggyToolResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { message: string };
}

let nextId = 1;

async function callTool<T>(
  accessToken: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  const requestId = nextId++;
  const payload = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: toolName, arguments: args },
    id: requestId,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(FOOD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // MCP servers can respond with either JSON or Server-Sent Events.
        // Swiggy's MCP is strict — omitting either media type gets a
        // "Not Acceptable: Client must accept both application/json and
        // text/event-stream" 406. For tools/call we always get JSON back
        // because we're doing single-shot RPCs, not subscribing to a
        // streaming channel.
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new SwiggyClientError(`Network error calling ${toolName}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 419) {
    throw new SwiggyClientError(
      "Swiggy session expired or revoked",
      response.status
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new SwiggyClientError(
      `Swiggy MCP ${response.status} on ${toolName}: ${text.slice(0, 300)}`,
      response.status
    );
  }

  // Swiggy's MCP can return either JSON or SSE per the MCP spec.
  // Detect by content-type; fall back to sniffing the body text.
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();

  let body: JsonRpcResponse<unknown>;

  const looksSse =
    contentType.includes("text/event-stream") ||
    /^(event|data|id|retry):/m.test(rawText);

  if (looksSse) {
    // SSE frames are separated by blank lines; within each frame the
    // `data:` line(s) hold the payload. For a single tools/call we
    // expect one data line with a JSON-RPC message. If multiple, take
    // the LAST (final result comes after any progress notifications).
    const dataLines = rawText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
      throw new SwiggyClientError(
        `SSE response from ${toolName} had no data line. Raw: ${rawText.slice(0, 300)}`
      );
    }

    const finalPayload = dataLines[dataLines.length - 1];
    try {
      body = JSON.parse(finalPayload) as JsonRpcResponse<unknown>;
    } catch (err) {
      throw new SwiggyClientError(
        `Invalid JSON inside SSE data line for ${toolName}: ${finalPayload.slice(0, 300)}`
      );
    }
  } else {
    try {
      body = JSON.parse(rawText) as JsonRpcResponse<unknown>;
    } catch (err) {
      throw new SwiggyClientError(
        `Non-JSON, non-SSE response from ${toolName} (content-type=${contentType}). Raw: ${rawText.slice(0, 300)}`
      );
    }
  }

  if ("error" in body) {
    throw new SwiggyClientError(
      `JSON-RPC error from ${toolName}: ${body.error.message}`,
      undefined,
      body.error.message
    );
  }

  // Swiggy returns tool responses as JSON strings in result.content[0].text
  // per the MCP spec. Some implementations might return result directly;
  // handle both shapes defensively.
  let toolResponse: SwiggyToolResponse<T>;
  const result = body.result as { content?: Array<{ text: string }> } | SwiggyToolResponse<T>;

  if (result && "content" in result && Array.isArray(result.content) && result.content[0]) {
    try {
      toolResponse = JSON.parse(result.content[0].text) as SwiggyToolResponse<T>;
    } catch (err) {
      throw new SwiggyClientError(
        `Invalid JSON in ${toolName} response: ${(err as Error).message}`
      );
    }
  } else {
    toolResponse = result as SwiggyToolResponse<T>;
  }

  if (!toolResponse.success) {
    throw new SwiggyClientError(
      toolResponse.error?.message ?? `${toolName} returned success=false`,
      undefined,
      toolResponse.error?.message
    );
  }

  if (toolResponse.data === undefined) {
    throw new SwiggyClientError(`${toolName} response missing data field`);
  }

  return toolResponse.data;
}

// ---------- Response normalization ----------

/**
 * Map whatever Swiggy returns into our SwiggyMenuItem shape.
 *
 * Field names are best-guess from the docs (name + description, etc.)
 * — we'll tighten these once we have a live response to verify.
 * For now, missing fields default to undefined / safe values; the
 * orchestrator's filter+rank steps handle that gracefully.
 */
interface RawSwiggyMenuItem {
  itemId?: string;
  id?: string;
  name?: string;
  description?: string;
  price?: number;
  finalPrice?: number;
  restaurantId?: string;
  restaurant?: { id?: string; name?: string };
  restaurantName?: string;
  isVeg?: boolean;
  vegFlag?: number | boolean;
  isVegan?: boolean;
  rating?: number;
  ratings?: { average?: number };
  imageUrl?: string;
  image?: string;
  category?: string;
  inStock?: boolean;
  isAvailable?: boolean;
  deepLink?: string;
  swiggyUrl?: string;
}

function normalizeMenuItem(raw: RawSwiggyMenuItem): SwiggyMenuItem {
  return {
    itemId: raw.itemId ?? raw.id ?? "unknown",
    name: raw.name ?? "Unknown item",
    description: raw.description ?? "",
    price: raw.finalPrice ?? raw.price ?? 0,
    restaurantId: raw.restaurant?.id ?? raw.restaurantId ?? "unknown",
    restaurantName: raw.restaurantName ?? raw.restaurant?.name ?? "Unknown",
    isVeg: raw.isVeg ?? (raw.vegFlag === 1 || raw.vegFlag === true),
    isVegan: raw.isVegan, // undefined when Swiggy doesn't tell us
    rating: raw.rating ?? raw.ratings?.average,
    imageUrl: raw.imageUrl ?? raw.image,
    category: raw.category,
    isAvailable: raw.isAvailable ?? raw.inStock ?? true,
    swiggyUrl: raw.swiggyUrl ?? raw.deepLink,
  };
}

// ---------- Implementation ----------

export class RealSwiggyClient implements SwiggyClient {
  async getAddresses(accessToken: string): Promise<SwiggyAddress[]> {
    const data = await callTool<{ addresses?: SwiggyAddress[] } | SwiggyAddress[]>(
      accessToken,
      "get_addresses",
      {}
    );
    if (Array.isArray(data)) return data;
    return data.addresses ?? [];
  }

  async searchRestaurants(
    _accessToken: string,
    _args: SearchRestaurantsArgs
  ): Promise<SwiggyPaginatedRestaurants> {
    throw new SwiggyClientError(
      "search_restaurants is not yet wired in RealSwiggyClient — pending live response sample to normalize the shape"
    );
  }

  async searchMenu(
    accessToken: string,
    args: SearchMenuArgs
  ): Promise<SwiggyPaginatedItems> {
    const swiggyArgs: Record<string, unknown> = {
      addressId: args.addressId,
      query: args.query,
    };
    if (args.vegOnly) swiggyArgs.vegFilter = 1;
    if (args.restaurantId) swiggyArgs.restaurantIdOfAddedItem = args.restaurantId;
    if (typeof args.offset === "number") swiggyArgs.offset = args.offset;

    const raw = await callTool<{
      items?: RawSwiggyMenuItem[];
      results?: RawSwiggyMenuItem[];
      nextOffset?: number | null;
    }>(accessToken, "search_menu", swiggyArgs);

    const items = (raw.items ?? raw.results ?? []).map(normalizeMenuItem);
    return { items, nextOffset: raw.nextOffset ?? null };
  }

  async getRestaurantMenu(
    _accessToken: string,
    _args: GetRestaurantMenuArgs
  ): Promise<SwiggyRestaurantMenu> {
    throw new SwiggyClientError(
      "get_restaurant_menu is not yet wired in RealSwiggyClient — pending live response sample to normalize the shape"
    );
  }
}
