import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "decode-named-character-reference": resolve(
        import.meta.dirname,
        "../../node_modules/decode-named-character-reference/index.js",
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4174" },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        "export-runtime": resolve(import.meta.dirname, "src/export-runtime.ts"),
      },
      output: { entryFileNames: "assets/[name].js" },
    },
  },
});
