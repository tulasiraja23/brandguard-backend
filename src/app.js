import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config/env.js";
import { errorHandler } from "./utils/http.js";
import authRoutes from "./routes/auth.js";
import ruleRoutes from "./routes/rules.js";
import factRoutes from "./routes/facts.js";
import submissionRoutes from "./routes/submissions.js";
import insightRoutes from "./routes/insights.js";
import imageAnalysisRoutes from "./routes/imageAnalysis.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: "100kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", aiMode: config.openaiKey ? "openai" : config.anthropicKey ? "claude" : "demo" }));

  if (!config.isTest) {
    app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false }));
  }

  app.use("/api", authRoutes);
  app.use("/api", ruleRoutes);
  app.use("/api", factRoutes);
  app.use("/api", submissionRoutes);
  app.use("/api", insightRoutes);
  app.use("/api", imageAnalysisRoutes);

  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use(errorHandler);
  return app;
}
