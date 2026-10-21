// Mede a rolagem do formulário antes de abrir a câmera e depois de voltar, em cada fluxo com foto.
// Uso: node scripts/qa/verify-camera-scroll.cjs <pasta-evidencias> [rótulo]
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://127.0.0.1:45127) e o @playwright/cli global.
// Esperado: depoisDaCamera igual a antesDaCamera (ou poucos px a mais para mostrar a miniatura nova) e "miniatura visível".
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core"));

const OUT = path.resolve(process.argv[2] || ".verificacao/camera-scroll");
const LABEL = process.argv[3] || "depois";
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://127.0.0.1:45127"}/webresource-app-motoristas.html`;
fs.mkdirSync(OUT, { recursive: true });

const FLOWS = [
  { name: "checklist", hash: "checklists", prepare: async (page) => { await page.locator(".agenda-hit").first().click(); await page.waitForTimeout(900); }, add: 'button[aria-label="Tirar foto: Lateral esquerda"]', confirm: "Confirmar" },
  { name: "gastos", hash: "gastos", add: 'button[aria-label="Adicionar comprovante"]', confirm: "Usar esta foto" },
  { name: "solicitar-manutencao", hash: "manutencao", warmup: 4, add: 'button[aria-label="Adicionar foto"]', confirm: "Confirmar" },
  { name: "colisoes", hash: "registro-colisao", add: 'button[aria-label="Adicionar foto em Local"]', confirm: "Confirmar" },
  { name: "receber", hash: "receber?serviceId=10240&type=SERVICO", warmup: 9, add: 'button[aria-label="Adicionar comprovante"]', confirm: "Confirmar" },
  { name: "finalizar-manutencao", hash: "finalizar?serviceId=76&type=MANUTENCAO", add: 'button[aria-label="Adicionar Fotos da manutenção"]', confirm: "Confirmar" }
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (message) => { if (message.type() === "error" && !(message.location().url || "").endsWith("/favicon.ico")) issues.push(message.text().slice(0, 160)); });
  // Foto do tamanho de uma câmera de celular (FOTO=LxA, padrão 4000x3000): a redução leva tempo de verdade.
  const [photoWidth, photoHeight] = (process.env.FOTO || "4000x3000").split("x").map(Number);
  const photo = path.join(OUT, `foto-${photoWidth}x${photoHeight}.jpg`);
  if (!fs.existsSync(photo)) {
    await page.goto("about:blank");
    const data = await page.evaluate(([w, h]) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); for (let top = 0; top < h; top += 25) for (let left = 0; left < w; left += 25) { x.fillStyle = `hsl(${(left * 7 + top * 3) % 360} 60% ${35 + ((left + top) % 40)}%)`; x.fillRect(left, top, 25, 25); } return c.toDataURL("image/jpeg", 0.92).split(",")[1]; }, [photoWidth, photoHeight]);
    fs.writeFileSync(photo, Buffer.from(data, "base64"));
  }
  const scroller = () => page.evaluate(() => { const s = [...document.querySelectorAll(".finalize-scroll")].pop(); return s ? { top: Math.round(s.scrollTop), max: s.scrollHeight - s.clientHeight } : null; });
  const results = [];
  await page.goto(`${BASE}#inicio`);
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase("app-motoristas-media-drafts"); });
  for (const flow of FLOWS) {
    try {
      await page.goto(`${BASE}?t=${Date.now()}#${flow.hash}`);
      await page.waitForTimeout(1300);
      if (flow.prepare) await flow.prepare(page);
      const button = page.locator(flow.add).first();
      // Formulários curtos só rolam com algumas fotos: adiciona antes de medir.
      for (let index = 0; index < (flow.warmup || 0); index += 1) {
        await button.click();
        await page.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(photo) });
        await page.getByRole("button", { name: flow.confirm, exact: true }).last().click({ timeout: 10000 });
        await page.waitForTimeout(1200);
      }
      await button.waitFor({ state: "attached", timeout: 8000 });
      // Rola até o meio do formulário com o botão da foto na área visível.
      const before = await page.evaluate(() => {
        const s = [...document.querySelectorAll(".finalize-scroll")].pop();
        s.scrollTop = Math.round((s.scrollHeight - s.clientHeight) / 2);
        return { top: Math.round(s.scrollTop), max: s.scrollHeight - s.clientHeight };
      });
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const tapped = await scroller();
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${flow.name}-1-antes-da-camera.png`) });
      await button.click();
      const input = page.locator('input[type=file][accept="image/*"]').first();
      await input.waitFor({ state: "attached", timeout: 8000 });
      await input.setInputFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(photo) });
      const confirm = page.getByRole("button", { name: flow.confirm, exact: true }).last();
      await confirm.waitFor({ state: "visible", timeout: 10000 });
      await confirm.click();
      await page.waitForTimeout(1800);
      const after = await scroller();
      const anchorVisible = await page.evaluate(() => {
        const s = [...document.querySelectorAll(".finalize-scroll")].pop();
        const thumbs = [...s.querySelectorAll("img")].filter((img) => img.src.startsWith("data:image") || img.src.startsWith("blob:"));
        const thumb = thumbs.pop();
        if (!thumb) return "sem miniatura";
        const a = thumb.getBoundingClientRect(); const b = s.getBoundingClientRect();
        return a.bottom > b.top && a.top < b.bottom ? "miniatura visível" : "miniatura fora da tela";
      });
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${flow.name}-2-depois-da-camera.png`) });
      results.push({ fluxo: flow.name, meio: before.top, antesDaCamera: tapped?.top, depoisDaCamera: after?.top, max: after?.max, anchorVisible });
    } catch (error) {
      results.push({ fluxo: flow.name, erro: String(error.message || error).split("\n")[0] });
    }
  }
  console.log(JSON.stringify({ rotulo: LABEL, results, consoleErrors: issues }, null, 2));
  fs.writeFileSync(path.join(OUT, `${LABEL}-resultado.json`), JSON.stringify({ results, consoleErrors: issues }, null, 2));
  await browser.close();
})();
