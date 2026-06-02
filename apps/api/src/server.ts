import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const ctx = createContext(config);
  const app = await buildApp(ctx);

  const shutdown = async (signal: string) => {
    app.log.info(`received ${signal}, shutting down`);
    try {
      await app.close();
      await ctx.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
