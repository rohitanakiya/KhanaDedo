import { Router } from "express";
import { validate } from "../../../middleware/validate.middleware";
import { login, signup } from "./auth.controller";
import { loginSchema, signupSchema } from "./auth.schemas";

const router = Router();

router.post("/signup", validate({ body: signupSchema }), signup);
router.post("/login", validate({ body: loginSchema }), login);

export default router;
