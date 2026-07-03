import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import {
  devFakeConnectSwiggy,
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


// Dev-only — inserts a mock Swiggy token so the orchestrator's
// Swiggy branch can be exercised without real OAuth. The handler
// refuses to run if NODE_ENV=production or SWIGGY_PROVIDER!=mock.
if (process.env.NODE_ENV !== "production") {
  router.post("/dev-fake-connect", devFakeConnectSwiggy);
}

export default router;
