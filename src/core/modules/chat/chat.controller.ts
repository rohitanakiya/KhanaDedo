import { Request, Response } from "express";
import { getRecommendationsFromText } from "./chat.service";
import type { RecommendInput } from "./chat.schemas";

export async function recommendFromChat(
  req: Request<unknown, unknown, RecommendInput>,
  res: Response
) {
  const { text } = req.body;
  const result = await getRecommendationsFromText(text, req.userId);
  res.status(200).json(result);
}
