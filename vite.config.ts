import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// `VITE_BASE` selects the deployment base path:
//   custom domain (default):     "/"
//   github.io/<repo>/ project:   "/<repo>/"
function normalizeBase(raw: string | undefined): string {
  let base = (raw ?? "/").trim();
  if (base === "") base = "/";
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return base;
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE),
  plugins: [react()],
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
    rolldownOptions: { input: { main: "index.html", legacy: "v1/index.html" } },
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/conformance/**/*.test.ts"],
    environment: "node",
  },
});

