// Cenários ponta a ponta do link de acompanhamento (Playwright) contra `pnpm dev:local` (36489) + `pnpm mock` (36490).
// Uso: `pnpm semear && pnpm e2e [pasta-de-saída]`. Gera screenshots mobile e resultado.json; `SO=7` ou `SO=8` roda só do cenário 7 / das bordas em diante.
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gravarTrackLocal } from "./kv-local.mjs";

const BASE = "http://127.0.0.1:36489", MOCK = "http://127.0.0.1:36490";
const SAIDA = process.argv[2] || `docs/verificacao/${new Date().toISOString().slice(0, 10)}`;
const REPO = process.argv[3] || ".";
mkdirSync(SAIDA, { recursive: true });
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const saida = { lat: -23.5614, lon: -46.6559 }, destino = { lat: -23.6267, lon: -46.6554 };
const aoNorte = (p, m) => ({ lat: p.lat + m / 111320, lon: p.lon });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const cenario = (c) => fetch(`${MOCK}/cenario`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) }).then((r) => r.json());
const SO = process.env.SO ? Number(process.env.SO) : 0;
const resultados = SO ? JSON.parse(readFileSync(`${SAIDA}/resultado.json`, "utf8")).filter((r) => !(SO <= 7 ? /^(7|B|Console)/ : /^(B|Console)/).test(r.nome)) : [];
function registrar(nome, ok, detalhe = "") { resultados.push({ nome, ok, detalhe }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${detalhe ? "  — " + detalhe : ""}`); }
const semear = (id, t) => gravarTrackLocal(id, t, REPO);
const expiraEm = new Date(Date.now() + 12 * 3600e3).toISOString();
const etapa = (tipo, p, rotulo) => ({ tipo, lat: p.lat, lon: p.lon, rotulo, rotuloLimpo: true, area: null });
const linkCompleto = (titulo, extra = {}) => ({ vehicleId: "veic-mock", placa: "MOCK123", corVeiculo: "Preto", modeloVeiculo: "Corolla Altis", titulo, expiraEm, modo: "completo",
  motorista: { nome: "Carlos", telefone: "(11) 98765-4321", temFoto: false }, destino: { ...saida, label: "Av. Paulista, 1000", rotuloLimpo: true }, destinoFinal: { ...destino, label: "Aeroporto de Congonhas", rotuloLimpo: true },
  etapas: [etapa("saida", saida, "Av. Paulista, 1000"), etapa("destino", destino, "Aeroporto de Congonhas")], ...extra });

// CHROME_PATH aponta para um Chromium já baixado quando o da versão do Playwright não existe.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ ...devices["iPhone 13"], timezoneId: "America/New_York", locale: "pt-BR" });
const erros = [];
async function abrir(id, { largura } = {}) {
  const page = await ctx.newPage();
  if (largura) await page.setViewportSize({ width: largura, height: 780 });
  page.on("console", (m) => { if (m.type() === "error") erros.push(`${id}: ${m.text()}`); });
  page.on("pageerror", (e) => erros.push(`${id}: ${e.message}`));
  await page.goto(`${BASE}/r/${id}`, { waitUntil: "domcontentloaded" });
  return page;
}
const texto = (page, id) => page.locator(`#${id}`).innerText().catch(() => "");
const foto = (page, nome) => page.screenshot({ path: `${SAIDA}/${nome}.png` });
async function esperarStatus(page, re, ms = 20000) { await page.waitForFunction((s) => new RegExp(s, "i").test(document.getElementById("status")?.innerText || ""), re.source, { timeout: ms }); }
async function esperarMapa(page) { await page.waitForFunction(() => document.querySelector(".maplibregl-canvas") && document.querySelector(".carro"), null, { timeout: 20000 }); await dormir(2500); }

// 1. A caminho longe: ETA, rota, carro desliza
if (!SO) {
  const id = "CenA00000001"; semear(id, linkCompleto("Embarque OS-20001", { horarioAgendado: new Date(Date.now() + 25 * 60000).toISOString() }));
  await cenario({ lat: aoNorte(saida, 6000).lat, lon: aoNorte(saida, 6000).lon, speed: 45, falhar: false, tomtomFalha: false, semPosicao: false, foto: false, fixTime: null });
  const page = await abrir(id);
  const t0 = Date.now();
  await esperarStatus(page, /A caminho/);
  const tStatus = Date.now() - t0;
  await esperarMapa(page);
  await foto(page, "1-a-caminho");
  const eta = await texto(page, "eta");
  registrar("1. A caminho com ETA e rota", /a caminho/i.test(await texto(page, "status")) && /\d+ min/.test(eta) && !(await page.locator("#eta").isHidden()), `status em ${tStatus} ms · ETA: ${eta.replace(/\s+/g, " ")}`);
  // deslizamento: observa cada mudança do transform do marcador (MutationObserver) após nova posição 300 m adiante
  await page.evaluate(() => { window.__mov = []; let last = null; const el = document.querySelector(".carro"); new MutationObserver(() => { if (el.style.transform !== last) { last = el.style.transform; window.__mov.push(performance.now()); } }).observe(el, { attributes: true, attributeFilter: ["style"] }); });
  await cenario({ lat: aoNorte(saida, 5700).lat, lon: aoNorte(saida, 5700).lon });
  await dormir(33000);
  const mov = await page.evaluate(() => window.__mov);
  const amostras = { length: mov.length, span: mov.length ? Math.round((mov[mov.length - 1] - mov[0]) / 1000) : 0 };
  registrar("1b. Carro desliza entre posições (sem salto)", amostras.length >= 20 && amostras.span >= 8, `${amostras.length} atualizações do marcador ao longo de ${amostras.span} s`);
  const rumo = await page.evaluate(() => document.querySelector(".carro-seta").style.backgroundPosition);
  // Sul = quadro 8 do sprite (coluna 0, linha 2 da grade 4x4 de 80px)
  registrar("1c. Carro aponta o rumo (sul)", /^0(px)? -160px$/.test(rumo), rumo);
  await page.close();
}
// 2. Chegando por geofence com histerese
if (!SO) {
  const id = "CenB00000002"; semear(id, linkCompleto("Embarque OS-20002"));
  await cenario({ lat: aoNorte(saida, 6000).lat, lon: aoNorte(saida, 6000).lon, speed: 45 });
  const page = await abrir(id);
  await esperarStatus(page, /A caminho/); await esperarMapa(page);
  await dormir(12500);
  await cenario({ lat: aoNorte(saida, 900).lat, lon: aoNorte(saida, 900).lon, speed: 30 });
  await esperarStatus(page, /chegando/, 25000);
  await dormir(1500);
  await foto(page, "2-chegando");
  const passo = await page.locator('.passo[data-passo="a_caminho"]').innerText();
  await dormir(12500);
  await cenario({ lat: aoNorte(saida, 1400).lat, lon: aoNorte(saida, 1400).lon, speed: 30 });
  await dormir(17000);
  const ainda = await texto(page, "status");
  registrar("2. Chegando a < 1 km, sem oscilar ao voltar para 1,4 km", passo.includes("Chegando") && /chegando/i.test(ainda), `barra: "${passo}" · após oscilar: "${ainda}"`);
  await page.close();
}
// 3. No local → Em viagem → Concluído (permanência de 60 s simulada pelo fixTime)
if (!SO) {
  const id = "CenC00000003"; semear(id, linkCompleto("Embarque OS-20003"));
  const agora = Date.now();
  await cenario({ ...saida, speed: 0, fixTime: new Date(agora - 70000).toISOString() });
  const page = await abrir(id);
  await esperarMapa(page);
  await dormir(12500);
  await cenario({ ...saida, speed: 0, fixTime: new Date(agora + 1000).toISOString() });
  await esperarStatus(page, /chegou/, 25000);
  await dormir(800);
  await foto(page, "3a-no-local");
  const aviso = await texto(page, "aviso");
  registrar("3a. Parado no embarque > 60 s → No local, aviso com carro e placa", /chegou/i.test(aviso) && /MOCK123/.test(aviso), aviso.replace(/\s+/g, " "));
  await dormir(12500);
  await cenario({ ...aoNorte(saida, -1500), speed: 50, fixTime: new Date(agora + 60000).toISOString() });
  await esperarStatus(page, /viagem em andamento/, 25000);
  await dormir(2500);
  await foto(page, "3b-em-viagem");
  const etaV = await texto(page, "eta");
  registrar("3b. Saiu com o passageiro → Em viagem com ETA ao destino", /destino/i.test(etaV) && /\d+ min/.test(etaV), etaV.replace(/\s+/g, " "));
  await dormir(12500);
  await cenario({ ...destino, speed: 0, fixTime: new Date(agora + 120000).toISOString() });
  await dormir(17000);
  await cenario({ ...destino, speed: 0, fixTime: new Date(agora + 190000).toISOString() });
  await dormir(17000);
  await cenario({ ...destino, speed: 0, fixTime: new Date(agora + 260000).toISOString() });
  await page.waitForFunction(() => !document.getElementById("concluido").hidden, null, { timeout: 45000 });
  await dormir(800);
  await foto(page, "3c-concluido");
  const cartaoOculto = await page.locator("#cartao").isHidden();
  registrar("3c. Destino atingido → Concluído com avaliação e cartão escondido", cartaoOculto && !(await page.locator("#avaliacao").isHidden()), await texto(page, "concluido-txt"));
  await page.close();
}
// 4. Infleet sem resposta: aviso discreto com idade da posição; volta sozinho
if (!SO) {
  const id = "CenD00000004"; semear(id, linkCompleto("Embarque OS-20004"));
  await cenario({ ...aoNorte(saida, 4000), speed: 45, fixTime: null, falhar: false });
  const page = await abrir(id);
  await esperarStatus(page, /A caminho/); await esperarMapa(page);
  await cenario({ falhar: true });
  await dormir(62000);
  const conexao = await texto(page, "conexao"), atualizado = await texto(page, "atualizado");
  const carroVisivel = await page.locator(".carro").isVisible();
  await foto(page, "4-infleet-fora");
  await cenario({ falhar: false });
  await dormir(31000);
  const voltou = await page.locator("#conexao").isHidden();
  registrar("4. Infleet fora 60 s → aviso discreto e idade da posição, sem tela em branco; volta sozinho", /rastreador|Reconectando|Sem conexão/.test(conexao) && /Última posição há/.test(atualizado) && carroVisivel && voltou, `"${conexao}" · "${atualizado}" · voltou: ${voltou}`);
  await page.close();
}
// 5. TomTom falha → OSRM, aviso sem trânsito e faixa
if (!SO) {
  const id = "CenE00000005"; semear(id, linkCompleto("Embarque OS-20005"));
  await cenario({ ...aoNorte(saida, 5000), speed: 45, tomtomFalha: true });
  const page = await abrir(id);
  await esperarStatus(page, /A caminho/); await esperarMapa(page);
  await foto(page, "5-sem-transito");
  const eta = await texto(page, "eta");
  registrar("5. TomTom falha → OSRM com faixa e aviso de trânsito", /–/.test(eta) && /Sem trânsito/.test(eta), eta.replace(/\s+/g, " "));
  await cenario({ tomtomFalha: false });
  await page.close();
}
// 6. Revogado / expirado / concluído pelo Dataverse
if (!SO) {
  const id = "CenF00000006"; semear(id, linkCompleto("Embarque OS-20006"));
  await fetch(`${BASE}/api/links/${id}`, { method: "DELETE", headers: { Authorization: "Bearer dev-local" } });
  const p1 = await abrir(id); await dormir(600); await foto(p1, "6a-revogado");
  const rev = await p1.locator("h1").innerText();
  const p2 = await abrir("NaoExiste001"); await dormir(600); await foto(p2, "6b-expirado");
  const exp = await p2.locator("h1").innerText();
  const id3 = "CenF00000007"; semear(id3, linkCompleto("Embarque OS-20007"));
  await fetch(`${BASE}/api/links/${id3}/concluir`, { method: "POST", headers: { Authorization: "Bearer dev-local" } });
  const p3 = await abrir(id3); await p3.waitForFunction(() => !document.getElementById("concluido").hidden, null, { timeout: 20000 }); await dormir(800); await foto(p3, "6c-concluido-dataverse");
  const semCartao = (await p3.locator("#cartao").isHidden()) && (await p1.locator("#cartao").count()) === 0;
  registrar("6. Revogado, expirado e concluído têm telas próprias sem cartão do motorista", rev === "Acompanhamento encerrado" && exp === "Link expirado" && semCartao, `${rev} · ${exp}`);
  await p1.close(); await p2.close(); await p3.close();
}
// 7. Cartão do motorista em 360 px + contraste AA (axe)
if (!SO || SO <= 7) {
  const id = "CenG00000008"; semear(id, linkCompleto("Embarque OS-20008"));
  await cenario({ ...aoNorte(saida, 3000), speed: 45, foto: true });
  const page = await abrir(id, { largura: 360 });
  await esperarStatus(page, /A caminho/); await esperarMapa(page);
  await page.waitForFunction(() => document.querySelector("#m-avatar img"), null, { timeout: 10000 }).catch(() => {});
  const avatar = await page.$eval("#m-avatar", (a) => ({ foto: a.querySelector("img")?.naturalWidth ?? 0, txt: a.textContent.trim() }));
  registrar("7c. Avatar a 360 px nunca vazio: foto real carregada", avatar.foto >= 16, JSON.stringify(avatar));
  await foto(page, "7-cartao-360px");
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, alvos: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })); });
  const cartao = await texto(page, "cartao");
  const legivel = /Carlos/.test(cartao) && /Corolla Altis/.test(cartao) && /Preto/.test(cartao) && /MOCK123/.test(cartao);
  const graves = axe.filter((v) => ["critical", "serious"].includes(v.impact));
  // Sino numa linha só a 360 px: 44 px de altura e o texto sem corte nem quebra.
  const sino = await page.waitForSelector("#sino-area:not([hidden])", { timeout: 8000 }).then(() => page.$eval("#sino-txt", (s) => ({ h: Math.round(s.closest("button").getBoundingClientRect().height), cabe: s.scrollWidth <= s.clientWidth })), () => null);
  registrar("7b. Sino em uma linha a 360 px (44 px, texto inteiro)", Boolean(sino && sino.h === 44 && sino.cabe), sino ? JSON.stringify(sino) : "sino oculto (sem VAPID no .dev.vars?)");
  registrar("7. Cartão legível em 360 px (foto, nome, modelo, cor, placa) e sem violação AA de contraste", legivel && graves.length === 0, graves.length ? JSON.stringify(graves) : "axe: 0 violações critical/serious");
  await page.close();
}
// T. Tempo real: WebSocket ao vivo, queda do WebSocket (polling segue), sino liga/desliga e bloqueado abre a folha.
// Exige um par VAPID de teste no .dev.vars (`node scripts/gerar-vapid.mjs`; ver .dev.vars.exemplo): sem ele o sino não aparece e o /avisos dá 404.
if (!SO) {
  const id = "CenT00000009"; semear(id, linkCompleto("Embarque OS-20009", { horarioAgendado: new Date(Date.now() + 40 * 60000).toISOString() }));
  await cenario({ ...aoNorte(saida, 6000), speed: 45, foto: false });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") erros.push(`${id}: ${m.text()}`); });
  page.on("pageerror", (e) => erros.push(`${id}: ${e.message}`));
  const quadros = [], pedidosDados = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => {
    try { const m = JSON.parse(f.payload); if (m.tipo === "dados") quadros.push({ em: Date.now(), lat: m.posicao?.lat }); } catch { /* quadro não JSON */ }
  }));
  page.on("request", (r) => { if (/\/dados(\?|$)/.test(r.url())) pedidosDados.push(Date.now()); });
  await page.goto(`${BASE}/r/${id}`, { waitUntil: "domcontentloaded" });
  await esperarStatus(page, /A caminho/);
  for (const ate = Date.now() + 10000; !quadros.length && Date.now() < ate;) await dormir(250);
  const pedidosAntes = pedidosDados.length, tMudanca = Date.now(), latNova = aoNorte(saida, 5500).lat;
  await cenario({ ...aoNorte(saida, 5500), speed: 45 });
  const nova = () => quadros.find((q) => q.em > tMudanca && Math.abs(q.lat - latNova) < 1e-4);
  for (const ate = Date.now() + 35000; !nova() && Date.now() < ate;) await dormir(250);
  registrar("T1. WebSocket ao vivo: posição nova chega por tipo \"dados\", sem /dados", Boolean(nova()) && pedidosDados.length === pedidosAntes,
    `${quadros.length} quadros · nova posição em ${nova() ? Math.round((nova().em - tMudanca) / 1000) + " s" : "—"} · /dados depois do WebSocket: ${pedidosDados.length - pedidosAntes}`);

  await page.close();

  // Sino pela tela. O Chromium headless não tem serviço de push: o subscribe é trocado por uma inscrição sintética
  // (chave P-256 válida, endpoint de host conhecido), e o POST/DELETE vão de verdade ao Worker local.
  const falsoPush = (permissao) => {
    let atual = null;
    Object.defineProperty(Notification, "permission", { get: () => permissao });
    Notification.requestPermission = () => Promise.resolve(permissao);
    PushManager.prototype.getSubscription = () => Promise.resolve(atual);
    PushManager.prototype.subscribe = async () => {
      const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const endpoint = "https://fcm.googleapis.com/fcm/send/e2e-local-" + Date.now();
      const keys = { p256dh: b64u(await crypto.subtle.exportKey("raw", par.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
      atual = { endpoint, toJSON: () => ({ endpoint, keys }), unsubscribe: () => { atual = null; return Promise.resolve(true); } };
      return atual;
    };
  };
  const abrirSino = async (permissao) => {
    const c = await browser.newContext({ ...devices["iPhone 13"], timezoneId: "America/New_York", locale: "pt-BR" });
    await c.addInitScript(falsoPush, permissao);
    const p = await c.newPage();
    p.on("pageerror", (e) => erros.push(`${id} sino: ${e.message}`));
    const avisos = [];
    p.on("response", (r) => { if (/\/avisos$/.test(r.url())) avisos.push(`${r.request().method()} ${r.status()}`); });
    await p.goto(`${BASE}/r/${id}`, { waitUntil: "domcontentloaded" });
    await esperarStatus(p, /A caminho|Chegando/);
    await esperarMapa(p);
    await p.waitForSelector("#sino-area:not([hidden])", { timeout: 8000 });
    return { c, p, avisos };
  };
  const pressionado = (p) => p.getAttribute("#sino", "aria-pressed");
  const toastTxt = (p) => p.waitForSelector("#toast.on", { timeout: 5000 }).then(() => p.innerText("#toast"), () => "");
  {
    const { c, p, avisos } = await abrirSino("granted");
    const linhas = await p.$eval("#sino", (b) => Math.round(b.getBoundingClientRect().height));
    await foto(p, "T3a-sino-desligado");
    await p.click("#sino");
    const tLigado = await toastTxt(p), pLigado = await pressionado(p), txtLigado = await p.innerText("#sino-txt");
    await dormir(250);
    const pos = await p.evaluate(() => {
      const t = document.querySelector("#toast").getBoundingClientRect();
      return { baixo: Math.round(innerHeight - t.bottom), noRodape: t.top > innerHeight * 0.6, centro: Math.round(Math.abs((t.left + t.right) / 2 - innerWidth / 2)) };
    });
    registrar("T3c. Toast no rodapé da tela (24 px), centralizado e longe do topo", pos.baixo >= 20 && pos.baixo <= 30 && pos.noRodape && pos.centro <= 2, JSON.stringify(pos));
    await foto(p, "T3b-sino-ligado-toast");
    await p.waitForSelector("#toast:not(.on)", { timeout: 6000 }).catch(() => {});
    await p.click("#sino");
    const tDesligado = await toastTxt(p), pDesligado = await pressionado(p);
    registrar("T3. Sino liga e desliga pela tela (201/204, aria-pressed, toast)",
      avisos.join(",") === "POST 201,DELETE 204" && pLigado === "true" && pDesligado === "false" && /Carlos/.test(tLigado) && /Aviso ligado/.test(txtLigado) && /desligado/i.test(tDesligado) && linhas === 44,
      `${avisos.join(" · ")} · ligado "${tLigado}" · desligado "${tDesligado}" · altura ${linhas}px`);
    await c.close();
  }
  {
    const { c, p, avisos } = await abrirSino("denied");
    await p.click("#sino");
    const aberta = await p.waitForSelector("#tc:not([hidden]) #tc-aviso:not([hidden])", { timeout: 5000 }).then(() => true, () => false);
    const foco = await p.evaluate(() => document.activeElement?.id);
    const titulo = await p.innerText("#tc-a-titulo").catch(() => "");
    await dormir(400);
    await foto(p, "T4-sino-bloqueado-folha");
    await p.click("#tc-entendi");
    const fechou = await p.waitForSelector("#tc", { state: "hidden", timeout: 3000 }).then(() => true, () => false);
    registrar("T4. Sino bloqueado: toque abre a folha (dialog, foco no título) e Entendi fecha", aberta && foco === "tc-a-titulo" && /bloqueadas/i.test(titulo) && fechou && !avisos.length,
      `folha ${aberta ? "aberta" : "fechada"} · foco ${foco} · "${titulo}" · fechou ${fechou} · pedidos ${avisos.length}`);
    await c.close();
  }

  // WebSocket que cai logo ao abrir (Playwright fecha no lugar do servidor): o polling segue trazendo /dados.
  const p2 = await ctx.newPage();
  p2.on("pageerror", (e) => erros.push(`${id}: ${e.message}`));
  await p2.routeWebSocket(/\/ao-vivo/, (ws) => ws.close({ code: 1011, reason: "bloqueado no e2e" }));
  const respostas = [];
  p2.on("response", (r) => { if (/\/dados(\?|$)/.test(r.url()) && r.ok()) respostas.push(Date.now()); });
  await p2.goto(`${BASE}/r/${id}`, { waitUntil: "domcontentloaded" });
  await esperarStatus(p2, /A caminho|Chegando/);
  const t0 = Date.now();
  await cenario({ ...aoNorte(saida, 5000), speed: 45 });
  await dormir(33000);
  const depois = respostas.filter((t) => t > t0).length;
  registrar("T2. WebSocket bloqueado: polling segue atualizando", depois >= 2, `${depois} respostas de /dados em 33 s`);
  await p2.close();
}
// Bordas: modo simples, sem foto (inicial), múltiplas etapas, fuso, aba em segundo plano
{
  await cenario({ ...aoNorte(saida, 3000), speed: 45, foto: false });
  const ps = await abrir("DevSimples01"); await esperarMapa(ps); await foto(ps, "8a-modo-simples");
  registrar("B1. Modo simples: só carro e cartão, linha curta e sem ETA", (await ps.locator("#paradas li").count()) === 4 && (await ps.locator("#eta").count()) === 0 && !(await ps.locator("#cartao").isHidden()));
  await ps.close();
  const pn = await abrir("DevSemNome01"); await esperarStatus(pn, /A caminho/);
  registrar("B2. Sem foto do motorista → inicial", (await pn.locator("#m-avatar").innerText()).trim() === "C", await pn.locator("#m-avatar").innerText());
  await pn.close();
  // Foto que falha (404) ou sem conteúdo (pixel 1x1) não pode deixar o círculo vazio: volta para a inicial.
  for (const [modo, id] of [["quebrada", "CenB0000002b"], ["pixel", "CenB0000002c"]]) {
    semear(id, linkCompleto(`Embarque foto ${modo}`)); await cenario({ foto: modo });
    const pf = await abrir(id); await esperarStatus(pf, /A caminho/); await dormir(1500);
    const av = await pf.$eval("#m-avatar", (a) => ({ img: Boolean(a.querySelector("img")), txt: a.textContent.trim() }));
    registrar(`B2${modo === "quebrada" ? "b" : "c"}. Foto ${modo} → inicial no avatar`, !av.img && av.txt === "C", JSON.stringify(av));
    await pf.close();
  }
  await cenario({ foto: false });
  await cenario({ ...aoNorte(saida, 6000), speed: 45 });
  const pp = await abrir("DevParadas01"); await esperarStatus(pp, /A caminho/); await esperarMapa(pp); await foto(pp, "8b-multiplas-etapas");
  registrar("B3. Múltiplas etapas listadas e numeradas no mapa", (await pp.locator("#paradas li[data-passo=parada]").count()) === 1 && (await pp.locator(".mk-etapa").count()) === 3);
  const etaTxt = await texto(pp, "eta");
  const horaSP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const horaNY = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const hh = (etaTxt.match(/às (\d\d):/) || [])[1];
  registrar("B4. Horários em America/Sao_Paulo mesmo com o navegador em Nova York", hh && Math.abs(Number(hh) - Number(horaSP.slice(0, 2))) <= 1 && hh !== horaNY.slice(0, 2), `ETA "${etaTxt.replace(/\s+/g, " ")}" · SP ${horaSP} · NY ${horaNY}`);
  // aba em segundo plano: simula ocultar, muda a posição 2 km, volta → carro salta (sem intermediárias) e dados reconciliados
  await pp.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  await dormir(13000);
  await cenario({ ...aoNorte(saida, 1000), speed: 45 });
  await pp.evaluate(() => window.__amostras = []);
  await pp.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  const col = setInterval(() => pp.evaluate(() => { const el = document.querySelector(".carro"); if (el) window.__amostras.push(el.style.transform); }).catch(() => {}), 300);
  // Com o WebSocket aberto, a posição nova pode vir no quadro seguinte do Viagem (até 15 s), não na reconsulta.
  for (let i = 0; i < 40 && !/chegando/i.test(await texto(pp, "status")); i++) await dormir(500);
  await dormir(1500); clearInterval(col);
  const am = await pp.evaluate(() => Array.from(new Set(window.__amostras)));
  registrar("B5. Volta do segundo plano: reconsulta e salta (≤ 4 posições distintas, sem animar 2 km)", am.length <= 4 && /chegando/i.test(await texto(pp, "status")), `${am.length} posições · status: ${await texto(pp, "status")}`);
  await pp.close();
}
await browser.close();
const consoleErros = erros.filter((e) => !/favicon|ERR_CONNECTION|net::|status of 404/.test(e));
registrar("Console sem erros de página", consoleErros.length === 0, consoleErros.slice(0, 5).join(" | "));
writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(resultados, null, 2));
console.log(`\n${resultados.filter((r) => r.ok).length}/${resultados.length} passaram`);
