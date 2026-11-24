// Gera public/og-betinhos.png (1200×630): a prévia do link no WhatsApp e redes. Arte fixa, sem dados do serviço.
// O medalhão (logo-b.png) já é escuro e dourado; o nome vem de logo-betinhos.png recortado e pintado de branco,
// porque o texto original é preto e sumiria sobre o fundo #001a3d. Uso: node scripts/gerar-og.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const publico = new URL("../public/", import.meta.url);
const dataUrl = (nome) => `data:image/png;base64,${readFileSync(new URL(nome, publico)).toString("base64")}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;background:#001a3d}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;
  background:radial-gradient(ellipse at 50% 40%,#0b2d5a 0%,#001a3d 62%)}
.medalhao{width:250px;height:250px;filter:drop-shadow(0 12px 28px rgba(0,0,0,.45))}
.nome{width:756px;height:172px;overflow:hidden;position:relative}
.nome img{position:absolute;left:0;bottom:0;width:756px;filter:brightness(0) invert(1)}
.filete{width:120px;height:3px;border-radius:2px;background:#c9a45c}
</style></head><body>
<img class="medalhao" src="${dataUrl("logo-b.png")}" alt="">
<div class="filete"></div>
<div class="nome"><img src="${dataUrl("logo-betinhos.png")}" alt=""></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: new URL("og-betinhos.png", publico).pathname, type: "png" });
  console.log("public/og-betinhos.png gerado (1200×630)");
} finally {
  await browser.close();
}
