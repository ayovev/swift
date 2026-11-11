import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Without a named group Rolldown lays chunks out by who imports what, and that moves: with a PostHog key set, about 70 kB
        // of dialog and Radix code landed in the entry chunk. React gets a file of its own, so it is the same on every build and a
        // deploy of app code leaves it cached. Recharts deliberately has no group: one was tried, and it pulled Recharts into the entry
        // chunk's static imports (the upload screen would have paid for every chart). Left alone it stays behind the lazy Dashboard.
        // See CLAUDE.md, "Architecture: the bundle split".
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
