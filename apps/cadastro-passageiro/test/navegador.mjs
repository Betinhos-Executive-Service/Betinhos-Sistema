// Playwright + Chromium para os e2e. Na máquina do Renan (Windows) os caminhos padrão valem; em Linux, aponte
// PLAYWRIGHT_DIR (pasta do pacote playwright) e CHROME_PATH (ex.: /usr/bin/brave-browser).
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_DIR || "C:/Users/mendo/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");

export { devices };
export function abrirNavegador() {
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || process.env.LOCALAPPDATA + "/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--no-sandbox"],
  });
}
