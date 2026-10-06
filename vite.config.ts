import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// GitHub Pages serves a project site from https://<user>.github.io/<repository>/,
// so the deploy workflow sets BASE_PATH=/<repository>/. Locally it's "/".
const base = process.env.BASE_PATH ?? "/";

/**
 * GitHub Pages has no rewrite rules, so opening /studio directly would 404.
 * Its 404 page is the app itself, and the router takes it from there.
 */
function spaFallback(): Plugin {
  let outDir = "dist";
  return {
    name: "spa-404-fallback",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      fs.copyFileSync(path.join(outDir, "index.html"), path.join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes; must run before the React plugin.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    spaFallback(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  optimizeDeps: {
    // Pre-bundle every client dependency up front. Without this, Vite
    // discovers deps lazily as each code-split route is first visited,
    // triggering "optimized dependencies changed. reloading" mid-navigation
    // — which Safari surfaces as "Importing a module script failed" + blank page.
    include: [
      "@hookform/resolvers",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "class-variance-authority",
      "clsx",
      "cmdk",
      "date-fns",
      "embla-carousel-react",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "input-otp",
      "lucide-react",
      "react-day-picker",
      "react-hook-form",
      "react-resizable-panels",
      "recharts",
      "sonner",
      "tailwind-merge",
      "vaul",
      "zod",
    ],
  },
});
