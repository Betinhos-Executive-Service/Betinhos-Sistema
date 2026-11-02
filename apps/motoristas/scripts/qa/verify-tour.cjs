// Roteiro headless do tour por capítulos (modo mock local, sem Xrm).
// Uso: node scripts/qa/verify-tour.cjs <pasta-evidencias> [capitulo1,capitulo2,...] [--largura=375]
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://localhost:31877) e um Chromium:
// CHROME_PATH=<binário> (ex.: Brave/Chrome) ou Google Chrome instalado (channel "chrome").
// Para cada capítulo: abre a tela, confere abertura automática (ou pelo botão "?"), percorre todos os passos
// conferindo destaque, cartão dentro da tela, passos obrigatórios sem pular, e tira um print por passo.
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  const candidates = ["playwright-core", "playwright", path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core")];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Rode com `NODE_PATH=<pasta com playwright-core>` ou `npx -y -p playwright-core@1.56.1`.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://localhost:31877"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/tour");
const ONLY = process.argv[3] && !process.argv[3].startsWith("--") ? new Set(process.argv[3].split(",")) : null;
const WIDTH = Number((process.argv.find((arg) => arg.startsWith("--largura=")) || "--largura=375").split("=")[1]);
const HEIGHT = WIDTH <= 360 ? 740 : 812;
const DRIVER = "localhost-driver";
const results = [];
const consoleIssues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
const note = (name, extra = "") => results.push(`SKIP ${name}${extra ? " — " + extra : ""}`);

const SOURCE = fs.readFileSync(path.join(__dirname, "../../src/app/tourChapters.ts"), "utf8");
const CHAPTER_IDS = [...SOURCE.matchAll(/^ {4}id: "([a-z-]+)",\s*\n {4}title:/gm)].map((match) => match[1]);
const D = "serviceId=10241&type=SERVICO";
// Serviço mock com valor a receber (cobrança por QR code e resumo de pagamento).
const R = "serviceId=10240&type=SERVICO";

// capítulo -> como chegar nele no modo mock. `auto: false` abre pelo botão "?".
const ROUTES = {
  inicio: { hash: "inicio" },
  servicos: { hash: "servicos" },
  detalhes: { hash: `detalhes?${D}` },
  receber: { hash: `receber?${R}` },
  "cobranca-qr": { hash: `receber?${R}`, before: async (page) => { await page.click("text=Cobrar por QR code"); await page.waitForTimeout(900); }, auto: false, optional: true },
  recibo: { hash: `recibo-personalizado?${D}` },
  voucher: { hash: `voucher?${D}` },
  assinatura: { hash: `assinatura?${D}`, auto: false },
  finalizar: { hash: `finalizar?${D}` },
  "cancelado-local": { hash: `cancelado-local?${D}` },
  gastos: { hash: "gastos" },
  camera: { hash: "foto-gasto", auto: false },
  historico: { hash: "historico" },
  "historico-detalhe": { hash: "detalhes-historico?serviceId=10239&type=SERVICO" },
  comunicados: { hash: "comunicados" },
  "comunicado-detalhe": { hash: "comunicados", before: async (page) => { await page.locator(".agenda-hit").first().click(); await page.waitForTimeout(900); } },
  checklists: { hash: "checklists" },
  "checklist-formulario": { hash: "checklists", before: async (page) => { await page.locator(".agenda-hit").first().click(); await page.waitForTimeout(900); } },
  multas: { hash: "multas" },
  "multa-detalhe": { hash: "multas", before: async (page) => { await page.locator(".termo-row").first().click(); await page.waitForTimeout(1200); } },
  manutencao: { hash: "manutencao" },
  colisoes: { hash: "colisoes" },
  "colisao-registro": { hash: "registro-colisao" },
  ideias: { hash: "boas-ideias" },
  "meu-carro": { hash: "meu-carro?mockTerceiro=1" }
};
// Só alcançáveis com foto/leitura em andamento: não exercitados no mock.
const NAO_EXERCITADOS = { comprovante: "exige leitura de comprovante em andamento (serviço remoto)", "foto-previa": "exige uma foto já capturada" };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const launch = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true };
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${String(error).slice(0, 160)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if ((message.location().url || "").endsWith("/favicon.ico")) return;
    consoleIssues.push(`error: ${message.text().slice(0, 160)}`);
  });

  const key = (id) => `app-motoristas-tour-v2:${DRIVER}:${id}`;
  const prepare = async (hash, seenExcept) => {
    await page.goto(`${BASE}?t=${Date.now()}#${hash}`);
    await page.evaluate(({ ids, except, keys }) => {
      localStorage.clear();
      ids.forEach((id) => { if (id !== except) localStorage.setItem(keys[id], "visto"); });
    }, { ids: CHAPTER_IDS, except: seenExcept, keys: Object.fromEntries(CHAPTER_IDS.map((id) => [id, key(id)])) });
    await page.reload();
    await page.waitForTimeout(2400);
  };
  const tourOpen = () => page.locator(".tour-card").count().then((n) => n > 0);
  const state = () => page.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }; };
    const root = document.querySelector(".tour-root");
    const card = document.querySelector(".tour-card");
    return {
      step: root?.dataset.tourStep ?? "",
      total: Number(root?.dataset.tourTotal ?? 0),
      skipped: root?.dataset.tourSkipped ?? "",
      progress: document.querySelector(".tour-card-progress")?.textContent ?? "",
      title: document.querySelector(".tour-card-title")?.textContent ?? "",
      next: document.querySelector(".tour-next")?.textContent?.trim() ?? "",
      spot: box(document.querySelector(".tour-spotlight")),
      card: box(card),
      cardScrolls: card ? card.scrollHeight > card.clientHeight + 1 : false,
      vw: innerWidth,
      vh: innerHeight
    };
  });
  const overlaps = (a, b) => a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

  const chapters = CHAPTER_IDS.filter((id) => !ONLY || ONLY.has(id));
  for (const id of chapters) {
    const route = ROUTES[id];
    if (!route) { note(`capítulo ${id}`, NAO_EXERCITADOS[id] || "sem rota no mock"); continue; }
    await prepare(route.hash, id);
    if (route.before) {
      try { await route.before(page); } catch (error) { if (route.optional) { note(`capítulo ${id}`, "recurso indisponível no mock"); continue; } throw error; }
      // O estado interno (detalhe aberto) dispara o capítulo certo sem recarregar.
      await page.waitForTimeout(1600);
    }
    if (route.auto === false) {
      check(`${id}: não abre sozinho`, !(await tourOpen()));
      const help = page.locator(".tour-help-button").first();
      if (!(await help.count())) { check(`${id}: botão ? presente`, false); continue; }
      await help.click();
      await page.waitForTimeout(900);
    } else if (!(await tourOpen())) {
      const help = page.locator(".tour-help-button").first();
      if (route.optional && !(await help.count())) { note(`capítulo ${id}`, "recurso indisponível no mock"); continue; }
      check(`${id}: abre sozinho na primeira visita`, false);
      continue;
    } else {
      check(`${id}: abre sozinho na primeira visita`, true);
    }
    const first = await state();
    check(`${id}: capítulo certo aberto`, await page.evaluate(() => document.querySelector(".tour-root")?.dataset.tourChapter) === id);
    check(`${id}: nenhum passo obrigatório pulado`, first.skipped === "", first.skipped ? `pulados: ${first.skipped}` : `${first.total} passos`);
    if (route.auto !== false) check(`${id}: botão ? presente no cabeçalho`, id === "inicio" || (await page.locator(".tour-help-button").count()) > 0);

    let guard = 0;
    for (;;) {
      const current = await state();
      const label = `${id}/${current.step}`;
      const inside = current.card && current.card.top >= 0 && current.card.left >= 0 && current.card.bottom <= current.vh + 0.5 && current.card.right <= current.vw + 0.5;
      check(`${label}: cartão dentro da tela`, Boolean(inside), JSON.stringify(current.card));
      if (current.spot && !(current.cardScrolls)) {
        const clash = overlaps(current.card, current.spot);
        check(`${label}: cartão não cobre o destaque`, !clash, clash ? `cartão ${JSON.stringify(current.card)} x destaque ${JSON.stringify(current.spot)}` : "");
      }
      if (guard === 0 || current.step === "boas-vindas") await page.screenshot({ path: path.join(SHOTS, `${WIDTH}-${id}-${String(guard + 1).padStart(2, "0")}-${current.step}.png`) });
      else await page.screenshot({ path: path.join(SHOTS, `${WIDTH}-${id}-${String(guard + 1).padStart(2, "0")}-${current.step}.png`) });
      const last = current.next === "Concluir";
      await page.click(".tour-next");
      await page.waitForTimeout(last ? 450 : 750);
      guard += 1;
      if (last || guard > 60) break;
    }
    check(`${id}: Concluir fecha o capítulo`, !(await tourOpen()));
    await page.reload();
    await page.waitForTimeout(2200);
    if (route.before) { try { await route.before(page); await page.waitForTimeout(1600); } catch { /* sem o estado, só confere abaixo */ } }
    if (route.auto !== false) check(`${id}: não volta para quem já viu`, !(await tourOpen()));
  }

  if (!ONLY || ONLY.has("inicio")) {
    // Pular, Esc, "Ver tour de novo" e foco devolvido, no Início.
    await prepare("inicio", "inicio");
    await page.goto(`${BASE}?t=${Date.now()}#inicio`);
    await page.evaluate(({ ids, keys }) => { localStorage.clear(); ids.forEach((id) => localStorage.setItem(keys[id], "visto")); }, { ids: CHAPTER_IDS, keys: Object.fromEntries(CHAPTER_IDS.map((id) => [id, key(id)])) });
    await page.reload();
    await page.waitForTimeout(2200);
    await page.click("text=Ver tour de novo");
    await page.waitForTimeout(900);
    check("2. 'Ver tour de novo' reabre o guia no passo 1", (await tourOpen()) && (await state()).progress.startsWith("Passo 1 de"));
    const seenAfterRestart = await page.evaluate(({ ids, keys }) => ids.filter((id) => localStorage.getItem(keys[id]) === "visto").length, { ids: CHAPTER_IDS, keys: Object.fromEntries(CHAPTER_IDS.map((id) => [id, key(id)])) });
    check("2. 'Ver tour de novo' reabre todos os capítulos das telas", seenAfterRestart === 0, `${seenAfterRestart} ainda marcados`);
    const trail = [];
    for (let i = 0; i < 4; i += 1) { await page.keyboard.press("Tab"); trail.push(await page.evaluate(() => (document.activeElement?.closest(".tour-card") ? document.activeElement.textContent.trim() : "FORA"))); }
    check("4. Tab circula só dentro do cartão", trail.every((item) => item !== "FORA"), trail.join(" > "));
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
    check("4. seta direita avança", (await state()).progress.startsWith("Passo 2 de"));
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(700);
    check("4. seta esquerda volta", (await state()).progress.startsWith("Passo 1 de"));
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    check("4. Esc fecha o tour", !(await tourOpen()));
    check("4. foco volta ao botão 'Ver tour de novo'", await page.evaluate(() => document.activeElement?.textContent?.trim() === "Ver tour de novo"));
    await page.reload(); await page.waitForTimeout(2200);
    check("1b. depois de Esc (pular) o tour do Início não volta", !(await tourOpen()));
  }

  check("console sem erros", consoleIssues.length === 0, consoleIssues.slice(0, 3).join(" | "));
  await browser.close();

  const report = results.join("\n");
  fs.writeFileSync(path.join(SHOTS, `resultado-${WIDTH}.txt`), report + "\n");
  console.log(report);
  const fails = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.filter((line) => line.startsWith("OK")).length} OK, ${fails} FAIL, ${results.filter((line) => line.startsWith("SKIP")).length} SKIP`);
  process.exit(fails ? 1 : 0);
})().catch((error) => {
  console.error("FAIL roteiro interrompido —", error && error.message ? error.message : error);
  process.exit(1);
});
