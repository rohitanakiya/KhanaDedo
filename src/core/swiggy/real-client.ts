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

  // MCP responses have two content channels:
  //   result.structuredContent — machine-parseable JSON (preferred)
  //   result.content[0].text   — human-readable text summary
  // Swiggy sends the actual data payload in structuredContent, and puts
  // a short summary like "Found 15 saved addresses" in content[0].text.
  // Older MCP servers put JSON-serialized data in content[0].text
  // instead. We check both and prefer structuredContent when present.
  let toolResponse: SwiggyToolResponse<T>;
  const result = body.result as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: SwiggyToolResponse<T> | unknown;
  } | SwiggyToolResponse<T>;

  if (
    result &&
    "structuredContent" in result &&
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    const sc = result.structuredContent as Record<string, unknown>;
    if ("success" in sc && typeof sc.success === "boolean") {
      // Swiggy's own {success, data, error} envelope inside structuredContent.
      toolResponse = sc as unknown as SwiggyToolResponse<T>;
    } else {
      // Raw data payload — no envelope. Wrap it so downstream code sees
      // the expected shape.
      toolResponse = { success: true, data: sc as T };
    }
  } else if (
    result &&
    "content" in result &&
    Array.isArray(result.content) &&
    result.content[0] &&
    typeof result.content[0].text === "string"
  ) {
    const text = result.content[0].text;
    try {
      toolResponse = JSON.parse(text) as SwiggyToolResponse<T>;
    } catch {
      // content[0].text is plain human text, not JSON, and there was no
      // structuredContent alongside it. Log the full body for debugging
      // and throw with a useful message.
      console.warn(
        `[swiggy-mcp] ${toolName} returned plain-text content with no ` +
          `structuredContent. Raw body: ${JSON.stringify(body).slice(0, 800)}`
      );
      throw new SwiggyClientError(
        `${toolName} returned no structured data. Text was: "${text.slice(0, 200)}"`
      );
    }
  } else {
    toolResponse = result as SwiggyToolResponse<T>;
  }

  if (!toolResponse.success) {
    // Log the full response envelope so we can see what Swiggy is saying
    // when the terse .error?.message isn't enough.
    console.warn(
      `[swiggy-mcp] ${toolName} success=false. Full body: ` +
        JSON.stringify(body).slice(0, 800)
    );
    throw new SwiggyClientError(
      toolResponse.error?.message ??
        toolResponse.message ??
        `${toolName} returned success=false (no error message from Swiggy — check Render logs for full body)`,
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

    const raw = await callTool<Record<string, unknown>>(
      accessToken,
      "search_menu",
      swiggyArgs
    );

    // Debug: log the full raw data payload so we can see exactly what
    // shape Swiggy returns. Our .items ?? .results extraction may be
    // wrong — real field name could be nested (data.results, hits,
    // menuItems, etc.). This log shows us so we can adjust.
    console.log(
      `[swiggy-mcp] search_menu raw data payload (first 800 chars): ` +
        JSON.stringify(raw).slice(0, 800)
    );

    const rawAsAny = raw as Record<string, unknown>;
    const items =
      ((rawAsAny.items ?? rawAsAny.results ?? rawAsAny.menuItems ?? []) as RawSwiggyMenuItem[]).map(
        normalizeMenuItem
      );
    const nextOffset = (rawAsAny.nextOffset ?? null) as number | null;
    return { items, nextOffset };
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
