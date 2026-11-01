// Roteiro headless do tour de primeiro acesso (modo mock local, sem Xrm).
// Uso: node scripts/qa/verify-tour.cjs <pasta-evidencias>
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://localhost:31877) e um Chromium:
// CHROME_PATH=<binário> (ex.: Brave/Chrome) ou Google Chrome instalado (channel "chrome").
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  const candidates = [
    "playwright-core",
    "playwright",
    path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core")
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Rode com `npx -y -p playwright-core@1.56.1 node scripts/qa/verify-tour.cjs <pasta>`.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://localhost:31877"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/tour");
const TOUR_KEY = "app-motoristas-tour-v1:localhost-driver";
const results = [];
const consoleIssues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const launch = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true };
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${String(error).slice(0, 160)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if ((message.location().url || "").endsWith("/favicon.ico")) return;
    consoleIssues.push(`error: ${message.text().slice(0, 160)}`);
  });

  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const open = async ({ firstAccess }) => {
    await page.goto(`${BASE}?t=${Date.now()}#inicio`);
    await page.evaluate(({ key, firstAccess }) => { localStorage.clear(); if (!firstAccess) localStorage.setItem(key, "visto"); }, { key: TOUR_KEY, firstAccess });
    await page.reload();
    await page.waitForTimeout(2200);
  };
  const tourOpen = () => page.locator(".tour-card").count().then((n) => n > 0);
  const seen = () => page.evaluate((key) => localStorage.getItem(key), TOUR_KEY);
  // Geometria do passo atual: destaque cobre o elemento real; cartão e botão Próximo dentro da viewport e fora do destaque.
  const geometry = () => page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const root = document.querySelector(".tour-root");
    const step = root?.dataset.tourStep ?? "";
    const spot = document.querySelector(".tour-spotlight");
    const card = document.querySelector(".tour-card");
    const next = document.querySelector(".tour-next");
    const anchorByStep = { servicos: "servicos", etapas: "servicos", "troca-checklist": "checklists", gastos: "expenses", comunicados: "comunicados", multas: "multas", manutencao: "maintenancePhoto" };
    const target = document.querySelector(`[data-tour="${anchorByStep[step]}"]`);
    return {
      step,
      progress: document.querySelector(".tour-card-progress")?.textContent ?? "",
      title: document.querySelector(".tour-card-title")?.textContent ?? "",
      hasSkip: Boolean(document.querySelector(".tour-skip")),
      nextLabel: next?.textContent?.trim() ?? "",
      focused: document.activeElement?.closest(".tour-card") ? document.activeElement.textContent.trim() : "FORA",
      viewport: { width: innerWidth, height: innerHeight },
      spot: spot ? box(spot) : null,
      card: card ? box(card) : null,
      next: next ? box(next) : null,
      target: target ? box(target) : null
    };
  });
  const inside = (b, v) => b && b.top >= 0 && b.left >= 0 && b.bottom <= v.height + 0.5 && b.right <= v.width + 0.5;
  const overlaps = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const covers = (spot, target) => spot && target && spot.top <= target.top + 1 && spot.left <= target.left + 1 && spot.bottom >= target.bottom - 1 && spot.right >= target.right - 1;
  const checkStep = async (label, expected) => {
    const g = await geometry();
    check(`${label}: passo "${expected.step}" visível`, g.step === expected.step && g.progress === expected.progress, `${g.progress} · ${g.title}`);
    check(`${label}: destaque cobre o elemento real`, covers(g.spot, g.target) && inside(g.target, g.viewport), JSON.stringify({ spot: g.spot, target: g.target }));
    check(`${label}: cartão e Próximo dentro da tela, sem cobrir o destaque`, inside(g.card, g.viewport) && inside(g.next, g.viewport) && !overlaps(g.card, g.spot), JSON.stringify({ card: g.card }));
    return g;
  };

  const steps = [
    { step: "servicos", progress: "Passo 1 de 7" },
    { step: "etapas", progress: "Passo 2 de 7" },
    { step: "troca-checklist", progress: "Passo 3 de 7" },
    { step: "gastos", progress: "Passo 4 de 7" },
    { step: "comunicados", progress: "Passo 5 de 7" },
    { step: "multas", progress: "Passo 6 de 7" },
    { step: "manutencao", progress: "Passo 7 de 7" }
  ];

  // 1. Primeiro acesso: abre sozinho; percorre os 7 passos com prints.
  await open({ firstAccess: true });
  check("1. primeiro acesso abre o tour sozinho", await tourOpen());
  for (let i = 0; i < steps.length; i += 1) {
    if (i > 0) { await page.click(".tour-next"); await page.waitForTimeout(900); }
    const g = await checkStep(`1.${i + 1}`, steps[i]);
    if (i === 0) check("1.1: foco inicial em Próximo", g.focused === "Próximo", g.focused);
    if (i === steps.length - 1) check("1.7: último passo mostra Concluir e esconde Pular", g.nextLabel === "Concluir" && !g.hasSkip, g.nextLabel);
    await shot(`tour-passo-${i + 1}`);
  }
  await page.click(".tour-next");
  await page.waitForTimeout(400);
  check("1. Concluir fecha e grava visto", !(await tourOpen()) && (await seen()) === "visto");

  // 5. Quem já viu não vê de novo.
  await page.reload();
  await page.waitForTimeout(2200);
  check("5. tour não volta para quem já viu", !(await tourOpen()));

  // 2. Reabrir pelo rodapé do Início.
  await page.click("text=Ver tour de novo");
  await page.waitForTimeout(900);
  check("2. 'Ver tour de novo' reabre no passo 1", (await tourOpen()) && (await geometry()).progress === "Passo 1 de 7");
  await shot("tour-reabrir");

  // 4. Teclado: Tab preso no cartão, setas navegam, Esc fecha.
  const focusTrail = [];
  for (let i = 0; i < 4; i += 1) { await page.keyboard.press("Tab"); focusTrail.push(await page.evaluate(() => (document.activeElement?.closest(".tour-card") ? document.activeElement.textContent.trim() : "FORA"))); }
  check("4. Tab circula só dentro do cartão", focusTrail.every((item) => item !== "FORA"), focusTrail.join(" > "));
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
  check("4. seta direita avança", (await geometry()).progress === "Passo 2 de 7");
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(700);
  check("4. seta esquerda volta", (await geometry()).progress === "Passo 1 de 7");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  check("4. Esc fecha o tour", !(await tourOpen()));
  check("4. foco volta ao botão 'Ver tour de novo'", await page.evaluate(() => document.activeElement?.textContent?.trim() === "Ver tour de novo"));

  // 1b. Pular no primeiro acesso: fecha e não volta.
  await open({ firstAccess: true });
  check("1b. tour aberto de novo após limpar a preferência", await tourOpen());
  await page.click(".tour-skip"); await page.waitForTimeout(400);
  check("1b. Pular fecha e grava visto", !(await tourOpen()) && (await seen()) === "visto");
  await page.reload(); await page.waitForTimeout(2200);
  check("1b. após Pular o tour não volta", !(await tourOpen()));

  // Borda: elemento do passo ausente é pulado sem erro.
  await page.evaluate(() => { document.querySelector('[data-tour="multas"]')?.remove(); document.querySelector('[data-tour="expenses"]')?.remove(); });
  await page.click("text=Ver tour de novo"); await page.waitForTimeout(900);
  const semAncora = await geometry();
  check("borda: passos sem elemento são pulados (5 passos)", semAncora.progress === "Passo 1 de 5", semAncora.progress);
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);

  // 4b. 360 px de largura.
  await page.setViewportSize({ width: 360, height: 740 });
  await open({ firstAccess: true });
  const g360 = await checkStep("4b. 360px", steps[0]);
  check("4b. cartão respeita 12 px de margem em 360 px", g360.card && g360.card.left >= 12 && g360.card.right <= 348, JSON.stringify(g360.card));
  await shot("tour-360");
  for (let i = 1; i < steps.length; i += 1) { await page.click(".tour-next"); await page.waitForTimeout(800); await checkStep(`4b.${i + 1} 360px`, steps[i]); }
  await shot("tour-360-ultimo");

  check("console sem erros", consoleIssues.length === 0, consoleIssues.slice(0, 3).join(" | "));
  await browser.close();

  const report = results.join("\n");
  fs.writeFileSync(path.join(SHOTS, "resultado.txt"), report + "\n");
  console.log(report);
  process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
})().catch((error) => {
  console.error("FAIL roteiro interrompido —", error && error.message ? error.message : error);
  process.exit(1);
});
