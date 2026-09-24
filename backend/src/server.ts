import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "server listening");
});

// Stop accepting connections, let in-flight requests finish, then exit.
// Force-exit if draining takes too long so the orchestrator isn't left waiting.
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutdown started");

  const forceExit = setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error({ err }, "error while closing server");
      process.exit(1);
    }
    logger.info("shutdown complete");
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  process.exit(1);
});
