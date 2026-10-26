import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `vite-plugin-singlefile` keeps the deployable artifact a single `index.html` (the
 * project's convention: drop it on any static host, no asset tree). That trade-off means
 * no hashed/immutable sub-resources, so the budget check in CI watches the whole payload.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Bind all interfaces so the dev server is reachable from a container or another host.
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
});
