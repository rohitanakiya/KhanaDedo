import { Request, Response } from "express";
import {
  getRecommendationsFromText,
  listSwiggyAddresses,
} from "./chat.service";
import type { RecommendInput } from "./chat.schemas";

export async function recommendFromChat(
  req: Request<unknown, unknown, RecommendInput>,
  res: Response
) {
  const { text, addressId } = req.body;
  const result = await getRecommendationsFromText(text, req.userId, addressId);
  res.status(200).json(result);
}

/** Returns the caller's Swiggy addresses so the frontend can render an
 *  address picker. Requires auth AND a stored Swiggy token — returns
 *  an empty list otherwise so the client can display a "connect Swiggy"
 *  prompt without treating the empty response as an error. */
export async function listAddresses(req: Request, res: Response) {
  const result = await listSwiggyAddresses(req.userId);
  res.status(200).json(result);
}
