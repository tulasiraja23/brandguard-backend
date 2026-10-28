import "dotenv/config";

const isTest = process.env.NODE_ENV === "test";

export const config = {
  env: process.env.NODE_ENV || "development",
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/brandguard",
  jwtSecret: process.env.JWT_SECRET || (isTest ? "test-secret-test-secret-test-secret" : ""),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.5",

  allowSelfApproval: process.env.ALLOW_SELF_APPROVAL === "true",
  bcryptRounds: isTest ? 4 : 12,
  seedPassword: process.env.SEED_PASSWORD || "Demo@12345",
};

export function assertConfig() {
  if (!config.jwtSecret || config.jwtSecret.length < 24 || config.jwtSecret.startsWith("replace-me")) {
    throw new Error("JWT_SECRET is missing or too weak. Set a long random value in .env (see .env.example).");
  }
}
