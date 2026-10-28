// Roteiro headless da leitura rápida do comprovante em "Registrar gasto" (modo mock local, sem Xrm).
// Uso: node scripts/qa/verify-expense-quickread.cjs <pasta-evidencias>
// Requer o app servido em APP_MOTORISTAS_URL (página /webresource-app-motoristas.html) e Google Chrome.
// Cobre os modos ?mockLeitura=ok|ilegivel|falha: foto pela câmera simulada, tela de leitura e o que sobra no formulário.
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  const candidates = [
    "playwright-core",
    path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core")
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Instale @playwright/cli global ou playwright-core no projeto.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://localhost:31877"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/expense-quickread");
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const mode of ["ok", "ilegivel", "falha"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: ANDROID_UA });
    // Câmera ao vivo simulada por um canvas (o app só usa getUserMedia com UA móvel).
    await context.addInitScript(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      setInterval(() => { ctx.fillStyle = "#eee"; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = "#123"; ctx.font = "40px sans-serif"; ctx.fillText("CUPOM", 60, 240); }, 100);
      navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(10);
      navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake", label: "Fake", groupId: "g" }];
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() !== "error" || (message.location().url || "").endsWith("/favicon.ico")) return;
      consoleErrors.push(message.text().slice(0, 160));
    });
    const main = () => page.locator("main").last();
    const waitForText = async (pattern, timeout = 15000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (pattern.test(await main().innerText().catch(() => ""))) return true;
        await page.waitForTimeout(250);
      }
      return false;
    };
    try {
      await page.goto(`${BASE}?mockLeitura=${mode}&t=${Date.now()}#inicio`);
      await page.waitForTimeout(1500);
      // Na Home, "Gastos" com formulário vazio abre a câmera direto.
      await main().getByRole("button", { name: /Gastos/ }).first().click();
      const shutter = main().locator(".photo-capture");
      await shutter.waitFor({ state: "visible", timeout: 10000 });
      const openButton = main().getByRole("button", { name: "Abrir câmera" });
      if (await openButton.count()) await openButton.click({ timeout: 1500 }).catch(() => {});
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll("main")].pop()?.querySelector(".photo-capture");
        return button && !button.disabled;
      }, null, { timeout: 10000 });
      await shutter.click();
      const confirm = main().getByRole("button", { name: "Usar esta foto" }).last();
      await confirm.waitFor({ state: "visible", timeout: 10000 });
      await confirm.click();
      if (mode === "ok") {
        const filled = await waitForText(/Registrar gasto/);
        await page.waitForTimeout(2500);
        const value = await main().getByLabel(/^Valor/).inputValue().catch(() => "");
        check(`[${mode}] leitura preenche o valor`, filled && value !== "", value);
      } else if (mode === "ilegivel") {
        check(`[${mode}] mostra a tela de comprovante ilegível`, await waitForText(/Tirar outra foto/) && await waitForText(/Aproxime o celular/));
      } else {
        const manual = await waitForText(/Registrar gasto/);
        const value = await main().getByLabel(/^Valor/).inputValue().catch(() => "?");
        check(`[${mode}] falha cai no preenchimento manual com valor vazio`, manual && value === "", value);
      }
      await page.screenshot({ path: path.join(SHOTS, `quickread-${mode}.png`) });
      check(`[${mode}] console sem erros`, consoleErrors.length === 0, consoleErrors.join(" | "));
    } catch (error) {
      check(`[${mode}] roteiro concluído`, false, String(error.message || error).slice(0, 160));
    } finally {
      await context.close();
    }
  }
  await browser.close();
  console.log(results.join("\n"));
  process.exitCode = results.some((line) => line.startsWith("FAIL")) ? 1 : 0;
})();
