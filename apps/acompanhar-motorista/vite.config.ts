// Build da página /r/<id> (React). O Worker serve `web-dist/` como Static Assets e devolve `portal.html` com o bootstrap injetado.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  // Arquivos estáticos que já existiam (carro.webp, logos, og, sw.js) seguem na raiz do site.
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../web-dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: "web/portal.html" },
  },
  server: { fs: { allow: [".."] } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/teste-setup.ts"],
    css: false,
  },
});
