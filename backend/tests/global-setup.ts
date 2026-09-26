import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Runs once before all test files: applies pending migrations to the test database.
// Vitest's test.env is not set in this process, so it is read from the project config.
export default function setup(project: TestProject) {
  const env = { ...process.env, ...project.config.env };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
}
