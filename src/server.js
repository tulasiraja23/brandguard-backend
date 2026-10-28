
import "dotenv/config";
import { assertConfig, config } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { createApp } from "./app.js";

assertConfig();
await connectDb();

createApp().listen(config.port, () => {
  console.log(
    `BrandGuard API on http://localhost:${config.port} (AI mode: ${
      config.openaiKey
        ? "OpenAI"
        : config.anthropicKey
          ? "claude"
          : "DEMO - no API key"
    })`
  );
});
