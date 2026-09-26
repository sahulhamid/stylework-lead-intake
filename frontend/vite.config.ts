import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API allows this exact origin (CORS_ORIGINS), so fail loudly instead of
  // silently moving to another port if 5173 is taken.
  server: { port: 5173, strictPort: true },
});
