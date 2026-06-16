import { Router } from "express";
import { validate } from "../../../middleware/validate.middleware";
import { login, signup } from "./auth.controller";
import { loginSchema, signupSchema } from "./auth.schemas";

const router = Router();

router.post("/signup", validate({ body: signupSchema }), signup);
router.post("/login", validate({ body: loginSchema }), login);

// /auth/swiggy/* is mounted separately in app.ts via swiggyRoutes —
// includes /start, /callback, /logout, /status. The placeholder
// callback that used to live here is replaced by the real handler
// in src/core/modules/swiggy.

export default router;
