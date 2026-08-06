import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(50, "Username is too long")
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid token"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
