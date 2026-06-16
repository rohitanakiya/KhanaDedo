import cors from "cors";
import express from "express";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./middleware/error.middleware";
import gatewayAuthMiddleware from "./middleware/gateway-auth.middleware";
import authRoutes from "./core/modules/auth/auth.routes";
import chatRoutes from "./core/modules/chat/chat.routes";
import menuRoutes from "./core/modules/menu/menu.routes";
import profileRoutes from "./core/modules/profile/profile.routes";
import swiggyRoutes from "./core/modules/swiggy/swiggy.routes";

const app = express();

// ---------- Global middleware ----------

// CORS: allow the frontend dev servers by default. Override in production
// by setting CORS_ORIGINS to a comma-separated list of allowed origins.
const corsOrigins = (
  process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Read identity headers from the gateway (no-op if GATEWAY_MODE != "true").
// Mounted before routes so handlers can read req.gateway.
app.use(gatewayAuthMiddleware);

// ---------- Routes ----------

app.use("/auth", authRoutes);
app.use("/chat", chatRoutes);
app.use("/menu", menuRoutes);
app.use("/profile", profileRoutes);
app.use("/auth/swiggy", swiggyRoutes);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    gatewayMode: process.env.GATEWAY_MODE === "true",
  });
});

// ---------- 404 + error handler (must be last) ----------

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
