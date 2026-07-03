/**
 * Picks the SwiggyClient implementation based on env var.
 *
 *   SWIGGY_PROVIDER=mock  (default)  -> MockSwiggyClient
 *   SWIGGY_PROVIDER=real             -> RealSwiggyClient
 *
 * The default is mock so that local dev and any unapproved deploys
 * don't accidentally hit Swiggy with our tokens. Flip the env var
 * on the deploy that has live credentials.
 */

import { MockSwiggyClient } from "./mock-client";
import { RealSwiggyClient } from "./real-client";
import type { SwiggyClient } from "./mcp-client";

let cached: SwiggyClient | null = null;

export function getSwiggyClient(): SwiggyClient {
  if (cached) return cached;

  const provider = (process.env.SWIGGY_PROVIDER ?? "mock").toLowerCase();

  if (provider === "real") {
    console.log("[swiggy] using RealSwiggyClient");
    cached = new RealSwiggyClient();
  } else {
    if (provider !== "mock") {
      console.warn(
        `[swiggy] unknown SWIGGY_PROVIDER="${provider}", defaulting to mock`
      );
    }
    cached = new MockSwiggyClient();
  }

  return cached;
}

/** Test-only — clear the cache so tests can swap providers. */
export function _resetSwiggyClient(): void {
  cached = null;
}
