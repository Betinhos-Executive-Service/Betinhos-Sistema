// Roteiro headless da tela "Enviar comprovante": quadro total / já pago / falta receber e conferência por IA.
// Uso: node scripts/qa/verify-receive-summary.cjs <pasta-evidencias>
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://localhost:31877) e Google Chrome instalado.
// O pagamento por QR é semeado no mock (sessionStorage); a leitura por IA usa ?mockLeitura=ok|ilegivel e ?mockLeituraValor.
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  for (const candidate of ["playwright-core", path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core")]) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Instale @playwright/cli global ou playwright-core no projeto.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://localhost:31877"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/receive-summary");
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const HASH = "receber?serviceId=10240&type=SERVICO";
const results = [];
const consoleIssues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: ANDROID_UA });
  await context.addInitScript(() => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      setInterval(() => { ctx.fillStyle = "#ddd"; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = "#123"; ctx.font = "40px sans-serif"; ctx.fillText("COMPROVANTE", 60, 240); }, 100);
      return canvas.captureStream(10);
    };
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake", label: "Fake", groupId: "g" }];
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()) && !(message.location().url || "").endsWith("/favicon.ico")) consoleIssues.push(`${message.type()}: ${message.text().slice(0, 160)}`);
  });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const main = () => page.locator("main").last();
  const text = async () => (await main().innerText()).replace(/\s+/g, " ");
  const dialog = () => page.locator('[role="dialog"]');
  const dialogText = async () => ((await dialog().count()) ? (await dialog().innerText()).replace(/\s+/g, " ") : "");

  // Cenário limpo: sem fotos salvas e com `paidCents` pago por QR no mock (0 = nenhum).
  const scenario = async (paidCents, query = "") => {
    await page.goto(`${BASE}?t=${Date.now()}#inicio`);
    await page.evaluate(async (cents) => {
      localStorage.clear();
      // Fotos de comprovante ficam no IndexedDB: limpa para cada cenário começar sem foto.
      for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
      sessionStorage.clear();
      if (!cents) return;
      const charge = { sessionId: "qa1", url: "https://example.test/qr", status: "pago", valorCentavos: cents, expiraEm: new Date(Date.now() + 3600e3).toISOString(), recusa: "" };
      const entry = { reservaId: "10240", charge, paidAt: Date.now() - 1000, pagante: { nome: "Renan de Almeida", email: "qa@example.test" }, idioma: "pt-BR", pagoEm: new Date().toISOString() };
      sessionStorage.setItem("betinhos.qrChargeMock.v1", JSON.stringify({ qa1: entry }));
    }, paidCents);
    await page.goto(`${BASE}?${query}${query ? "&" : ""}t=${Date.now()}#${HASH}`);
    await page.waitForTimeout(1500);
  };
  const takePhoto = async () => {
    await main().getByRole("button", { name: "Adicionar comprovante" }).click();
    const shutter = main().locator(".photo-capture");
    await shutter.waitFor({ state: "visible", timeout: 10000 });
    const openButton = main().getByRole("button", { name: "Abrir câmera" });
    if (await openButton.count()) await openButton.click({ timeout: 1500 }).catch(() => {});
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("main")].pop()?.querySelector(".photo-capture");
      return button && !button.disabled;
    }, null, { timeout: 10000 });
    await shutter.click();
    const confirm = main().getByRole("button", { name: "Confirmar" }).last();
    await confirm.waitFor({ state: "visible", timeout: 10000 });
    await confirm.click();
    await main().getByRole("button", { name: "Ver comprovante 1" }).waitFor({ state: "visible", timeout: 10000 });
  };
  const finalize = () => page.getByRole("button", { name: "FINALIZAR" }).click();
  const leftReceive = async () => {
    await page.waitForTimeout(1000);
    return !/Enviar comprovante/.test(await page.locator("main").last().innerText().catch(() => ""));
  };

  // 1) Sem pagamento: só "Valor a receber".
  await scenario(0);
  let body = await text();
  check("Sem QR: mostra só 'Valor a receber R$ 380,00'", /Valor a receber R\$ 380,00/.test(body) && !/Falta receber/.test(body), body.slice(0, 120));
  await shot("1-sem-pagamento");

  // 2) Parcial: quadro completo, nome do pagante sem horário, aviso e comprovante obrigatório.
  await scenario(10000, "mockLeitura=ok");
  body = await text();
  check("Parcial: total, já pago com nome e falta receber",
    /Total do serviço R\$ 380,00/.test(body) && /Já pago por QR Renan de Almeida R\$ 100,00/.test(body) && /Falta receber R\$ 280,00/.test(body), body.slice(0, 200));
  check("Parcial: sem horário do pagamento", !/\d{2}:\d{2}/.test(await main().locator(".receive-summary").innerText()));
  check("Parcial: aviso 'Envie o comprovante do restante'", /Envie o comprovante do restante \(R\$ 280,00\)/.test(body));
  await shot("2-parcial");
  await finalize();
  await page.waitForTimeout(400);
  check("Parcial: FINALIZAR sem foto pede comprovante", /Adicione ao menos um comprovante/.test(await text()) && (await dialog().count()) === 0);

  // 3) IA lê valor menor (R$ 51,90): popup; "Ainda não" volta; "Sim, recebi tudo" finaliza.
  await takePhoto();
  await finalize();
  await dialog().waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
  const popup = await dialogText();
  check("IA com valor menor: popup 'Você recebeu os R$ 280,00 que faltavam?'", /Você recebeu os R\$ 280,00 que faltavam\?/.test(popup) && /Sim, recebi tudo/.test(popup) && /Ainda não/.test(popup), popup);
  await shot("3-popup-valor-menor");
  await dialog().getByRole("button", { name: "Ainda não" }).click();
  await page.waitForTimeout(300);
  check("'Ainda não' fecha o popup e fica na tela", (await dialog().count()) === 0 && /Enviar comprovante/.test(await text()));
  await finalize();
  await dialog().waitFor({ state: "visible", timeout: 25000 });
  await dialog().getByRole("button", { name: "Sim, recebi tudo" }).click();
  check("'Sim, recebi tudo' finaliza (não bloqueia)", await leftReceive());

  // 4) IA lê o valor que falta: segue direto, sem popup.
  await scenario(10000, "mockLeitura=ok&mockLeituraValor=280");
  await takePhoto();
  await finalize();
  await page.waitForTimeout(3500);
  check("IA cobre o que falta: segue sem popup", (await leftReceive()) && (await dialog().count()) === 0);

  // 5) Foto ilegível: popup, e a finalização continua permitida.
  await scenario(0, "mockLeitura=ilegivel");
  await takePhoto();
  await finalize();
  await dialog().waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
  check("Ilegível (sem QR): popup com o total R$ 380,00", /Você recebeu os R\$ 380,00 que faltavam\?/.test(await dialogText()));
  await shot("5-popup-ilegivel");
  await dialog().getByRole("button", { name: "Sim, recebi tudo" }).click();
  check("Ilegível: 'Sim, recebi tudo' finaliza", await leftReceive());

  // 6) Quitado por QR: "Tudo recebido", comprovante opcional, FINALIZAR sem foto.
  await scenario(38000);
  body = await text();
  check("Quitado: 'Tudo recebido' e 'Comprovante opcional'", /Tudo recebido/.test(body) && /Comprovante opcional/.test(body) && !/Falta receber/.test(body), body.slice(0, 200));
  const green = await main().locator(".receive-summary-row.is-paid span").evaluate((el) => getComputedStyle(el).color);
  check("Quitado: 'Tudo recebido' em verde #147A4B", green === "rgb(20, 122, 75)", green);
  check("Quitado: sem asterisco de obrigatório", (await main().locator(".form-field-required").count()) === 0);
  await shot("6-quitado");
  await finalize();
  check("Quitado: FINALIZAR sem foto segue", await leftReceive());

  check("Console sem erros/avisos", consoleIssues.length === 0, consoleIssues.slice(0, 5).join(" || "));
  console.log(results.join("\n"));
  await browser.close();
  process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
})().catch((error) => {
  console.log(results.join("\n"));
  console.error("ERRO:", error.message.split("\n")[0]);
  process.exit(1);
});
