import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative asset paths (`base: "./"`) so the built dist/ drops into the
// intended production shape: served by the same Fastify process as the
// API, at whatever path prefix that ends up mounted under. See
// panel/docs/frontend-implementation-plan.md §1 and §6.1.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8710",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
