import { Router } from "express";
import { validate } from "../../../middleware/validate.middleware";
import {
  forgotPassword,
  login,
  resetPasswordHandler,
  signup,
} from "./auth.controller";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "./auth.schemas";

const router = Router();

router.post("/signup", validate({ body: signupSchema }), signup);
router.post("/login", validate({ body: loginSchema }), login);
router.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  forgotPassword
);
router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  resetPasswordHandler
);

// /auth/swiggy/* is mounted separately in app.ts via swiggyRoutes —
// includes /start, /callback, /logout, /status.

export default router;
