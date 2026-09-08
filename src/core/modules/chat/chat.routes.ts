import { Router } from "express";
import { optionalAuthMiddleware } from "../../../middleware/optional-auth.middleware";
import { validate } from "../../../middleware/validate.middleware";
import { listAddresses, listMcpTools, recommendFromChat } from "./chat.controller";
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

/** GET /chat/addresses — lists the caller's Swiggy addresses so the
 *  frontend can offer a picker. Returns { addresses: [] } for callers
 *  without an active Swiggy connection; the frontend uses that to
 *  hide the picker and show a connect prompt. */
router.get("/addresses", listAddresses);

/** TEMP diagnostic — remove once the Swiggy MCP tool catalog is known. */
router.get("/mcp-tools", listMcpTools);

export default router;
