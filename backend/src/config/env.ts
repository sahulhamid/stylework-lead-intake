import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  META_VERIFY_TOKEN: z.string().min(1),
  META_APP_SECRET: z.string().min(16),
  // Browser origins allowed to call the API (the dashboard), comma-separated.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(
      z.array(
        z.url().refine((url) => new URL(url).origin === url, {
          message: "must be an origin like https://app.example.com (no path or trailing slash)",
        }),
      ),
    ),
});

export type Env = z.infer<typeof envSchema>;

// Fail fast: a misconfigured deploy should crash on boot with a clear message,
// not on the first request that touches the missing value.
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
