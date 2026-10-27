// Carregamento: lista antes das fotos (spinner por foto) e reabertura instantânea pelo cache local.
// Uso: node test/carregamento.e2e.mjs "http://127.0.0.1:52418/#t=<43 caracteres>" [pasta-prints]
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/mendo/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const [url, prints] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ ...devices["Pixel 7"] })).newPage();
const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

let t = Date.now();
await p.goto(url); await p.waitForSelector(".card:not(.sk-card)");
const tLista = Date.now() - t;
const spinners = await p.locator(".foto.carregando .spinner").count();
ok(spinners === 2, `esperava 2 spinners de foto, veio ${spinners}`);
ok((await p.locator(".foto-legenda").first().textContent()) === "Carregando a foto…", "legenda de carregamento");
if (prints) await p.screenshot({ path: `${prints}/8-fotos-carregando.png` });
await p.locator(".foto img").nth(1).waitFor();
const tFotos = Date.now() - t;
ok((await p.locator(".foto.carregando").count()) === 0, "spinners somem quando a foto chega");
if (prints) await p.screenshot({ path: `${prints}/9-fotos-prontas.png` });

// Reabertura: com o "ler" atrasado 2 s, a lista salva aparece na hora.
await p.route("**/api/ler", async (r) => { await new Promise((x) => setTimeout(x, 2000)); await r.continue(); });
t = Date.now();
await p.reload(); await p.waitForSelector(".card:not(.sk-card)");
const tReabrir = Date.now() - t;
ok(tReabrir < 1500, `reabertura deveria vir do cache, levou ${tReabrir} ms`);
ok((await p.locator(".sk-card").count()) === 0, "sem esqueleto na reabertura");

console.log(JSON.stringify({ tLista, tFotos, tReabrir, falhas }));
await b.close();
process.exit(falhas.length ? 1 : 0);
