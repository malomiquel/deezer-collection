import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type UserConfig } from "vite"

// Three builds into dist/, one after the other (see package.json):
// - main.js: content script in Deezer's page world (IIFE: content scripts can't be ES modules)
// - bridge.js: content script in the isolated world, relays chrome.* to main.js
// - popup.html + options.html: the settings pages
// TARGET selects bridge or pages; the default is main.
const target = process.env.TARGET ?? "main"
const src = resolve(import.meta.dirname, "src")
const dist = resolve(import.meta.dirname, "dist")

const contentScript = (entry: string, name: string): UserConfig["build"] => ({
  lib: {
    entry: resolve(src, entry),
    name,
    formats: ["iife"],
    fileName: () => `${target}.js`,
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": src } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root: target === "pages" ? resolve(src, "pages") : import.meta.dirname,
  base: "./",
  // Only the main build copies public/ (manifest, icons, locales).
  publicDir: target === "main" ? resolve(import.meta.dirname, "public") : false,
  build: {
    outDir: dist,
    // The builds share dist/; `npm run build` cleans it first.
    emptyOutDir: false,
    minify: mode !== "development",
    ...(target === "pages"
      ? {
          rollupOptions: {
            input: {
              popup: resolve(src, "pages/popup.html"),
              options: resolve(src, "pages/options.html"),
            },
          },
        }
      : target === "bridge"
        ? contentScript("bridge.ts", "DeezerCollectionBridge")
        : contentScript("main/main.ts", "DeezerCollection")),
  },
}))
