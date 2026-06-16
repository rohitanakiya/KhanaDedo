import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import {
  logoutSwiggy,
  startSwiggyAuth,
  swiggyAuthCallback,
  swiggyStatus,
} from "./swiggy.controller";

const router = Router();

// /callback is unauthenticated by design — Swiggy redirects the
// user's browser here, and we use the `state` parameter (mapped to
// a stored entry) to find the originating KhanaDedo user.
router.get("/callback", swiggyAuthCallback);

// All other Swiggy routes require the user to be logged in to
// KhanaDedo first.
router.use(authMiddleware);

router.post("/start", startSwiggyAuth);
router.post("/logout", logoutSwiggy);
router.get("/status", swiggyStatus);

export default router;
