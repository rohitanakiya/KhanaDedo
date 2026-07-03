import { Router } from "express";
import { optionalAuthMiddleware } from "../../../middleware/optional-auth.middleware";
import { validate } from "../../../middleware/validate.middleware";
import { recommendFromChat } from "./chat.controller";
import { recommendSchema } from "./chat.schemas";

const router = Router();

// optionalAuth so anonymous callers still work (the live demo path),
// while authenticated callers can route through their Swiggy session.
router.use(optionalAuthMiddleware);

router.post(
  "/recommend",
  validate({ body: recommendSchema }),
  recommendFromChat
);

export default router;
