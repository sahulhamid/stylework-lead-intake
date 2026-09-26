import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Tests never read .env: fixed values, and a separate database they are free to empty.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgresql://leads:leads@localhost:5432/leads_test",
      META_VERIFY_TOKEN: "test-verify-token",
      META_APP_SECRET: "test-app-secret-1234",
    },
    // Integration tests share one database, so test files run one after another.
    fileParallelism: false,
  },
});
