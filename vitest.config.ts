import { defineConfig } from "vitest/config";

/**
 * Test-only Vite config. Deliberately separate from `vite.config.ts`: no tailwind plugin,
 * no single-file inliner — unit tests need a fast, DOM-only environment, not a bundle.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/game/**/*.{ts,tsx}", "src/components/**/*.tsx"],
      exclude: [
        "src/main.tsx",
        // Types-only module: it compiles to nothing, so it can never be "covered".
        "src/game/types.ts",
      ],
      thresholds: {
        // Floors, not aspirations. These sit a few points under what the suite actually
        // reaches today (96% lines / 82% branches / 96% functions) so that a drop is a
        // signal to investigate, not a nightly chore to re-baseline.
        lines: 92,
        functions: 94,
        branches: 78,
        statements: 90,
      },
    },
  },
});
