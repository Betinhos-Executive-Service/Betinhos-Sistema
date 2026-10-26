// Teste: foto em retrato (3:4) não pode vazar da área tocável; tocar no meio da imagem visível abre o seletor.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/mendo/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ ...devices["Pixel 7"] })).newPage();
await p.goto(process.argv[2]); await p.waitForSelector(".foto img");
// Troca a foto do 1º passageiro por um retrato 300x400 gerado no canvas
await p.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 300; c.height = 400; c.getContext("2d").fillRect(0, 0, 300, 400);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "retrato.jpg", { type: "image/jpeg" }));
  const i = document.querySelector(".foto-input"); i.files = dt.files; i.dispatchEvent(new Event("change"));
});
await p.waitForSelector(".foto.nova img");
const foto = await p.locator(".foto").first().boundingBox(), img = await p.locator(".foto img").first().boundingBox();
const vaza = img.height - foto.height > 1 || img.width - foto.width > 1;
const ponto = [img.x + img.width / 2, img.y + img.height * 0.9];
const fc = p.waitForEvent("filechooser", { timeout: 1500 }).then(() => true, () => false);
await p.touchscreen.tap(...ponto);
const abriu = await fc;
console.log(JSON.stringify({ foto, img, vaza, abriu }));
await b.close();
process.exit(!vaza && abriu ? 0 : 1);
