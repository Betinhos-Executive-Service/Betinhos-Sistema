// Fluxo real: toque na foto -> seletor -> JPEG 4000x3000 -> prévia imediata -> foto comprimida -> salvar.
import { abrirNavegador, devices } from "./navegador.mjs";
const b = await abrirNavegador();
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
// Dados digitados nos campos NÃO acompanham a foto automática (ficam para o "Salvar")
await card.locator("input[type=tel]").fill("11987654321");
const enviado = p.waitForRequest((r) => r.url().endsWith("/api/salvar"));
const fc = p.waitForEvent("filechooser"); await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
const t1 = Date.now(); await (await fc).setFiles({ name: "IMG_20261026.jpg", mimeType: "image/jpeg", buffer: jpeg });
await card.locator(".foto img").waitFor(); const tPrevia = Date.now() - t1;
await card.locator(".aviso.ok").waitFor(); const tSalva = Date.now() - t1;
const corpoEnviado = JSON.parse((await enviado).postData());
const miniaturaKB = Math.round((corpoEnviado.miniaturaBase64?.length ?? 0) * 0.75 / 1024), fotoEnviadaKB = Math.round(corpoEnviado.fotoBase64.length * 0.75 / 1024);
const falhas = [];
if (!miniaturaKB || miniaturaKB > 60 || miniaturaKB * 3 > fotoEnviadaKB) falhas.push(`miniatura ausente ou grande demais (${miniaturaKB} KB de ${fotoEnviadaKB} KB)`);
if ("telefone" in corpoEnviado || "email" in corpoEnviado) falhas.push("o envio automático da foto levou telefone/e-mail junto");
const aviso = await card.locator(".aviso").textContent();
if (aviso.trim() !== "Foto salva.") falhas.push(`aviso: ${aviso}`);
if ((await card.locator("input[type=tel]").inputValue()) !== "(11) 98765-4321") falhas.push("o telefone digitado deveria continuar no campo");
if ((await card.locator(".btn.primario").textContent()) !== "Salvar telefone") falhas.push(`botão deveria oferecer só o telefone: ${await card.locator(".btn.primario").textContent()}`);
console.log(JSON.stringify({ fotoEnviadaKB, miniaturaKB, arquivoKB: Math.round(jpeg.length / 1024), tLista, tPrevia, tSalva, aviso, falhas }));
await b.close();
process.exit(falhas.length ? 1 : 0);
