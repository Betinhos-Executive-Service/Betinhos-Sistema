// Envio do checklist no mock: sucesso, falha de foto (com retomada) e falha de registro.
// Uso: node scripts/qa/verify-checklist-send.cjs <pasta-evidencias> [sucesso|foto|registro] [rótulo]
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://127.0.0.1:45127) e o @playwright/cli global.
// REDUCED=1 emula prefers-reduced-motion. Imprime a sequência do carregamento (seen) e o log das tentativas.
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core"));

const OUT = path.resolve(process.argv[2] || ".verificacao/checklist-send");
const MODE = process.argv[3] || "sucesso";
const LABEL = process.argv[4] || "depois";
const QUERY = MODE === "sucesso" ? "" : `?mockChecklistFalha=${MODE}`;
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://127.0.0.1:45127"}/webresource-app-motoristas.html${QUERY}`;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: process.env.REDUCED ? "reduce" : "no-preference" });
  const page = await context.newPage();
  await page.goto("about:blank");
  const photo = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 800; c.height = 600; const x = c.getContext("2d"); x.fillStyle = "#2159d2"; x.fillRect(0, 0, 800, 600); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; }), "base64");
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !(m.location().url || "").endsWith("/favicon.ico")) errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}#checklists`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("app-motoristas-tour-v1:localhost-driver", "visto"); indexedDB.deleteDatabase("app-motoristas-media-drafts"); });
  await page.goto(`${BASE}${QUERY ? "&" : "?"}t=${Date.now()}#checklists`);
  await page.waitForTimeout(1300);
  await page.locator(".agenda-hit").first().click();
  await page.waitForTimeout(900);
  for (const item of ["Frente do veículo", "Traseira do veículo", "Lateral esquerda", "Lateral direita", "Painel ligado"]) {
    await page.locator(`button[aria-label="Tirar foto: ${item}"]`).click();
    await page.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: photo });
    await page.getByRole("button", { name: "Confirmar", exact: true }).click({ timeout: 10000 });
    await page.waitForTimeout(700);
  }
  await page.locator('[role="group"][aria-label="Pneus"] button', { hasText: /^OK$/ }).click();
  await page.waitForTimeout(500);

  // Grava cada estado visível: o carregamento (se houver) ou o rótulo do botão.
  await page.evaluate(() => {
    window.__seen = [];
    const snap = () => {
      const card = document.querySelector(".expense-send-card");
      const button = [...document.querySelectorAll("button")].find((b) => b.classList.contains("finalize-primary"));
      const formLocked = [...document.querySelectorAll(".checklist-form input, .checklist-form textarea, .checklist-form button")].every((el) => el.disabled);
      const state = card
        ? `${card.className.replace("expense-send-card ", "")} | ${card.querySelector("h2").textContent} | ${[...card.querySelectorAll(".expense-send-step")].map((x) => x.className.split(" ")[1] + ":" + x.textContent.replace(/(concluído|em andamento|aguardando)$/, "")).join(" / ")}${card.querySelector(".expense-send-bar span") ? " | barra " + card.querySelector(".expense-send-bar span").style.transform : ""}${formLocked ? " | form travado" : ""}`
        : `sem overlay | botão: ${button ? button.textContent.trim() : "-"}`;
      if (window.__seen.at(-1) !== state) window.__seen.push(state);
    };
    snap();
    new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await page.getByRole("button", { name: "Enviar checklist" }).click();
  await page.waitForTimeout(450);
  const opened = await page.evaluate(() => {
    const overlay = document.querySelector(".expense-send-overlay");
    return { focoNoDialogo: Boolean(document.activeElement?.closest(".expense-send-card")), overlayNoBody: overlay?.parentElement === document.body, foraDoScreenMotion: !overlay?.closest(".screen-motion") };
  });
  await page.screenshot({ path: path.join(OUT, `${LABEL}-${MODE}-1-enviando.png`) });

  const log = [`ao abrir: ${JSON.stringify(opened)}`];
  if (MODE === "sucesso") {
    await page.waitForSelector(".expense-send-card.is-done", { timeout: 15000 }).then(() => page.screenshot({ path: path.join(OUT, `${LABEL}-${MODE}-2-sucesso.png`) })).catch(() => log.push("sem estado de sucesso"));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${MODE}-3-lista.png`) });
    log.push(`lista: ${(await page.locator("main").last().innerText()).replace(/\n/g, " / ").slice(0, 200)}`);
  } else {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const outcome = await Promise.race([
        page.waitForSelector(".expense-send-card.is-error", { timeout: 15000 }).then(() => "erro"),
        page.waitForSelector(".expense-send-card.is-done", { timeout: 15000 }).then(() => "sucesso")
      ]).catch(() => "nada");
      log.push(`tentativa ${attempt}: ${outcome}`);
      if (outcome !== "erro") break;
      if (attempt === 1) {
        await page.screenshot({ path: path.join(OUT, `${LABEL}-${MODE}-2-erro.png`) });
        log.push(`foco no erro: ${await page.evaluate(() => document.activeElement?.textContent)}`);
        log.push(`texto: ${await page.locator(".expense-send-card p").innerText()}`);
        // Voltar do celular com o erro aberto: nada muda (igual ao gasto).
        const hashBefore = await page.evaluate(() => location.hash);
        await page.goBack(); await page.waitForTimeout(500);
        log.push(`Voltar do celular no erro: overlay=${await page.locator(".expense-send-card").count()} hash ${hashBefore} -> ${await page.evaluate(() => location.hash)}`);
        await page.getByRole("button", { name: "Voltar e revisar" }).click();
        await page.waitForTimeout(400);
        const state = await page.evaluate(() => ({ overlay: !!document.querySelector(".expense-send-card"), thumbs: document.querySelectorAll(".checklist-form .collision-evidence-thumb img").length, editable: !document.querySelector(".checklist-form textarea")?.disabled }));
        log.push(`Voltar e revisar: ${JSON.stringify(state)}`);
        log.push(`foco depois de Voltar e revisar: ${await page.evaluate(() => document.activeElement?.textContent?.trim())}`);
        await page.screenshot({ path: path.join(OUT, `${LABEL}-${MODE}-3-revisar.png`) });
        if (MODE === "registro") break;
        await page.getByRole("button", { name: "Enviar checklist" }).click();
      } else {
        await page.getByRole("button", { name: "Tentar de novo" }).click();
      }
    }
    await page.waitForTimeout(2500);
  }
  const seen = await page.evaluate(() => window.__seen);
  console.log(JSON.stringify({ rotulo: LABEL, modo: MODE, seen, log, consoleErrors: errors }, null, 2));
  fs.writeFileSync(path.join(OUT, `${LABEL}-${MODE}.json`), JSON.stringify({ seen, log, consoleErrors: errors }, null, 2));
  await browser.close();
})();
