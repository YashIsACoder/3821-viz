import { resolve } from "node:path";
import { defineConfig } from "vite";

// Relative base so the site works under any GitHub Pages path.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        story: resolve(__dirname, "index.html"),
        compare: resolve(__dirname, "compare.html"),
        results: resolve(__dirname, "results.html"),
      },
    },
  },
});
