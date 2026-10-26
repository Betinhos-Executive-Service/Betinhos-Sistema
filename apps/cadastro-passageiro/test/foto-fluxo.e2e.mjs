// Fluxo real: toque na foto -> seletor -> JPEG 4000x3000 -> prévia imediata -> foto comprimida -> salvar.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/mendo/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ ...devices["Pixel 7"] })).newPage();
const t0 = Date.now();
await p.goto(process.argv[2]); await p.waitForSelector(".card");
const tLista = Date.now() - t0;
const jpeg = Buffer.from(await p.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 4000; c.height = 3000;
  const g = c.getContext("2d"); for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i},60%,50%)`; g.fillRect(Math.random()*4000, Math.random()*3000, 300, 300); }
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  return [...new Uint8Array(await blob.arrayBuffer())];
}));
const card = p.locator(".card").nth(2); await card.locator(".foto").scrollIntoViewIfNeeded();
const box = await card.locator(".foto").boundingBox();
const fc = p.waitForEvent("filechooser"); await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
const t1 = Date.now(); await (await fc).setFiles({ name: "IMG_20261026.jpg", mimeType: "image/jpeg", buffer: jpeg });
await card.locator(".foto img").waitFor(); const tPrevia = Date.now() - t1;
await card.locator(".foto.nova").waitFor(); const tPronta = Date.now() - t1;
const botao = await card.locator(".btn.primario").textContent();
const t2 = Date.now(); await card.locator(".btn.primario").click(); await card.locator(".aviso.ok").waitFor(); const tSalvar = Date.now() - t2;
console.log(JSON.stringify({ arquivoKB: Math.round(jpeg.length / 1024), tLista, tPrevia, tPronta, botao, tSalvar, aviso: await card.locator(".aviso").textContent() }));
await b.close();
