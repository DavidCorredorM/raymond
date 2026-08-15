import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Root-relative asset paths: the built dist/ is served from the root of
// the same Fastify process that serves the API (server/src/index.ts),
// not from a sub-path. Was `base: "./"` (relative) until 2026-08-15 —
// relative paths resolve against the *current URL*, so a hard reload or
// deep link on a nested client-side route (e.g. /vault/graph) looked for
// assets at /vault/assets/... instead of /assets/..., 404ing. See
// panel/docs/frontend-implementation-plan.md §1 and §6.1.
export default defineConfig({
  base: "/",
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
