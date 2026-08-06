import { Request, Response } from "express";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../errors";
import {
  authenticateUser,
  createPasswordReset,
  createUser,
  resetPassword,
} from "./auth.service";
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from "./auth.schemas";

export async function signup(
  req: Request<unknown, unknown, SignupInput>,
  res: Response
) {
  const { email, password, username } = req.body;

  let result;
  try {
    result = await createUser(email, password, username);
  } catch (error: unknown) {
    // Postgres unique_violation
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      throw new ConflictError("Email or username already exists");
    }
    throw error;
  }

  res.status(201).json({
    message: "User created",
    ...result,
  });
}

export async function login(
  req: Request<unknown, unknown, LoginInput>,
  res: Response
) {
  const { email, password } = req.body;

  let authResult;
  try {
    authResult = await authenticateUser(email, password);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "USER_INACTIVE") {
      throw new ForbiddenError("User account is inactive");
    }
    throw error;
  }

  if (!authResult) {
    throw new UnauthorizedError("Invalid email or password");
  }

  res.status(200).json({ message: "Login successful", ...authResult });
}


// ---------- POST /auth/forgot-password ----------

/**
 * Kicks off a password-reset email. Always returns success — never
 * reveals whether the email is registered (defense against email
 * enumeration). Failures inside createPasswordReset are logged
 * server-side; the user sees the same message either way.
 */
export async function forgotPassword(
  req: Request<unknown, unknown, ForgotPasswordInput>,
  res: Response
) {
  const { email } = req.body;

  // Fire-and-forget effectively — but we await so any thrown error
  // hits the logger cleanly. createPasswordReset handles its own
  // "email doesn't exist" case silently.
  try {
    await createPasswordReset(email);
  } catch (err) {
    console.error(`[auth] forgot-password unexpected error:`, err);
  }

  res.status(200).json({
    message:
      "If an account exists for that email, we've sent a reset link. Check your inbox (and spam folder).",
  });
}

// ---------- POST /auth/reset-password ----------

export async function resetPasswordHandler(
  req: Request<unknown, unknown, ResetPasswordInput>,
  res: Response
) {
  const { token, password } = req.body;

  try {
    await resetPassword(token, password);
  } catch (err) {
    // resetPassword throws generic errors — always show as 400 with
    // a generic message.
    throw new BadRequestError(
      (err as Error).message || "Invalid or expired reset link"
    );
  }

  res.status(200).json({
    message: "Password updated. You can now log in with your new password.",
  });
}
