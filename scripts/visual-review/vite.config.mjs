// Separate local-only UI harness. Never imported by the app or production build.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (name) => fileURLToPath(new URL(name, import.meta.url));
const sourceRoot = process.env.DRIP_REVIEW_BASELINE || path("../../");
export default defineConfig({
  root: path("./"),
  publicDir: `${sourceRoot}/public`,
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      { find: "@tanstack/react-start", replacement: path("./fixture-functions.ts") },
      { find: "@/integrations/supabase/client", replacement: path("./fixture-client.ts") },
      { find: /^@\/lib\/.*\.functions$/, replacement: path("./fixture-functions.ts") },
      { find: "@", replacement: `${sourceRoot}/src` },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.DRIP_REVIEW_PORT || 4175),
    strictPort: true,
    fs: { allow: [path("../../"), sourceRoot] },
  },
});
