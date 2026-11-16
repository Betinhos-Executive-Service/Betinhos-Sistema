// Roteiro headless da chave da nota fiscal em "Registrar gasto" (modo mock local, sem Xrm), a 390 px com câmera falsa.
// Uso: node scripts/qa/verify-expense-nota-fiscal.cjs <pasta-evidencias>
// Requer o app servido em APP_MOTORISTAS_URL (página /webresource-app-motoristas.html) e Google Chrome.
// Cobre: os quatro caminhos (ler o QR, digitar, "Não consigo ler", "Comprovante sem nota fiscal"), chave recusada por DV,
// nota repetida (?mockNotaRepetida=1) e a chave sugerida pela leitura rápida (?mockLeitura=ok&mockLeituraChave=1).
// Só chaves e CNPJs fictícios, montados aqui com o DV certo (o repositório é público).
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode-generator");

function loadPlaywright() {
  const candidates = ["playwright-core", path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core")];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Instale @playwright/cli global ou playwright-core no projeto.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://localhost:31877"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/expense-nota-fiscal");
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

// DV em módulo 11 (pesos 2..9 da direita, ASCII − 48), o mesmo do app.
const mod11 = (texto) => {
  let soma = 0;
  for (let i = 0; i < texto.length; i++) soma += (texto.charCodeAt(texto.length - 1 - i) - 48) * (2 + (i % 8));
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
};
const cnpj = (base) => { const d1 = mod11(base); return `${base}${d1}${mod11(base + d1)}`; };
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const chave = (numero = "000004321") => { const b = `33${hoje.slice(2, 4)}${hoje.slice(5, 7)}${cnpj("987654320001")}65001${numero}112345678`; return `${b}${mod11(b)}`; };
const CHAVE_QR = chave("000000777");
const CHAVE_DIGITADA = chave("000001234");
const trocarUm = (c, i) => c.slice(0, i) + String((Number(c[i]) + 1) % 10) + c.slice(i + 1);

function matrizQr(texto) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (qr.isDark(y, x) ? 1 : 0)));
}

async function abrirContexto(browser, query) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ANDROID_UA, deviceScaleFactor: 2 });
  await context.addInitScript(() => { try { localStorage.setItem("app-motoristas-tour-v2:localhost-driver:*", "visto"); } catch { /* sem storage */ } });
  // Câmera ao vivo simulada: "CUPOM" por padrão; com window.__qr (matriz), desenha o QR da NFC-e.
  await context.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    setInterval(() => {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 640, 480);
      const qr = window.__qr;
      if (!qr) { ctx.fillStyle = "#123"; ctx.font = "40px sans-serif"; ctx.fillText("CUPOM", 60, 240); return; }
      const lado = Math.floor(400 / (qr.length + 8));
      const x0 = (640 - lado * qr.length) / 2, y0 = (480 - lado * qr.length) / 2;
      ctx.fillStyle = "#000";
      qr.forEach((linha, y) => linha.forEach((v, x) => { if (v) ctx.fillRect(x0 + x * lado, y0 + y * lado, lado, lado); }));
    }, 100);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(10);
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake", label: "Fake", groupId: "g" }];
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error" || (message.location().url || "").endsWith("/favicon.ico")) return;
    consoleErrors.push(message.text().slice(0, 160));
  });
  await page.goto(`${BASE}?t=${Date.now()}${query ? `&${query}` : ""}#inicio`);
  await page.waitForTimeout(1500);
  return { context, page, consoleErrors };
}

const main = (page) => page.locator("main").last();
const folha = (page) => page.getByTestId("nota-fiscal-sheet");

async function tirarFotoDoComprovante(page) {
  await main(page).locator('[data-tour="expenses"]').click();
  const attach = main(page).getByRole("button", { name: "Anexar despesa" });
  await attach.waitFor({ state: "visible", timeout: 10000 });
  await attach.click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("main")].pop()?.querySelector(".photo-capture");
    return button && !button.disabled;
  }, null, { timeout: 10000 });
  await main(page).locator(".photo-capture").click();
  const confirm = main(page).getByRole("button", { name: "Usar esta foto" }).last();
  await confirm.waitFor({ state: "visible", timeout: 10000 });
  await confirm.click();
  await folha(page).waitFor({ state: "visible", timeout: 15000 });
}

const textoDaLista = (page) => page.getByTestId("nota-fiscal-lista").innerText().catch(() => "");

async function cenario(browser, nome, query, roteiro) {
  const { context, page, consoleErrors } = await abrirContexto(browser, query);
  try {
    await roteiro(page);
    check(`[${nome}] console sem erros`, consoleErrors.length === 0, consoleErrors.join(" | "));
  } catch (error) {
    await page.screenshot({ path: path.join(SHOTS, `erro-${nome}.png`) }).catch(() => {});
    check(`[${nome}] roteiro concluído`, false, String(error.message || error).slice(0, 200));
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  await cenario(browser, "ler-qr", "", async (page) => {
    await tirarFotoDoComprovante(page);
    const caminhos = ["Ler o QR ou o código de barras", "Digitar a chave", "Não consigo ler", "Comprovante sem nota fiscal"];
    const visiveis = await Promise.all(caminhos.map((nome) => folha(page).getByRole("button", { name: nome }).isVisible()));
    check("[ler-qr] folha com os quatro caminhos", visiveis.every(Boolean), visiveis.join(","));
    await page.screenshot({ path: path.join(SHOTS, "nota-1-quatro-caminhos.png") });
    await folha(page).getByRole("button", { name: caminhos[0] }).click();
    await main(page).getByText(/Aponte para o QR/).waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, "nota-2-ler-codigo.png") });
    await page.evaluate((qr) => { window.__qr = qr; }, matrizQr(`https://www.fazenda.rj.gov.br/nfce/consulta?p=${CHAVE_QR}|2|1|1|0A1B2C3D4E5F`));
    await page.getByText("Chave da nota conferida.").waitFor({ timeout: 15000 });
    const lista = await textoDaLista(page);
    check("[ler-qr] QR lido na câmera grava a chave conferida", /Chave conferida · NFC-e 777 · RJ/.test(lista), lista.replace(/\n/g, " / "));
    await page.getByTestId("nota-fiscal-lista").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, "nota-3-qr-conferido.png") });
  });

  await cenario(browser, "digitar", "", async (page) => {
    await tirarFotoDoComprovante(page);
    await folha(page).getByRole("button", { name: "Digitar a chave" }).click();
    const input = page.getByTestId("nota-fiscal-input");
    await input.fill(trocarUm(CHAVE_DIGITADA, 30).match(/.{1,4}/g).join(" "));
    const aviso = await folha(page).innerText();
    const conferir = folha(page).getByRole("button", { name: "Conferir chave" });
    check("[digitar] chave com um número trocado é recusada na hora pelo DV", /algum número foi digitado errado/.test(aviso) && await conferir.isDisabled());
    await page.screenshot({ path: path.join(SHOTS, "nota-4-dv-recusado.png") });
    await input.fill(CHAVE_DIGITADA.match(/.{1,4}/g).join(" "));
    check("[digitar] chave certa mostra o emitente", /98\.765\.432\/0001-/.test(await folha(page).innerText()));
    await conferir.click();
    await page.getByText("Chave da nota conferida.").waitFor({ timeout: 10000 });
    check("[digitar] chave digitada fica conferida", /Chave conferida · NFC-e 1234 · RJ/.test(await textoDaLista(page)));
  });

  for (const [nome, botao, esperado, foto] of [
    ["nao-consigo-ler", "Não consigo ler", "Nota não verificada", "nota-5-nao-consigo-ler.png"],
    ["sem-nota", "Comprovante sem nota fiscal", "Sem nota fiscal", "nota-6-sem-nota-fiscal.png"]
  ]) {
    await cenario(browser, nome, "", async (page) => {
      await tirarFotoDoComprovante(page);
      await folha(page).getByRole("button", { name: botao }).click();
      await folha(page).waitFor({ state: "detached", timeout: 5000 });
      const lista = await textoDaLista(page);
      check(`[${nome}] comprovante fica "${esperado}"`, lista.includes(esperado), lista.replace(/\n/g, " / "));
      await page.getByTestId("nota-fiscal-lista").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, foto) });
    });
  }

  await cenario(browser, "repetida", "mockNotaRepetida=1", async (page) => {
    await tirarFotoDoComprovante(page);
    await folha(page).getByRole("button", { name: "Digitar a chave" }).click();
    await page.getByTestId("nota-fiscal-input").fill(CHAVE_DIGITADA);
    await folha(page).getByRole("button", { name: "Conferir chave" }).click();
    await folha(page).getByRole("alert").waitFor({ timeout: 10000 });
    const texto = await folha(page).getByRole("alert").innerText();
    check("[repetida] nota já usada mostra o aviso com a data", /já foi usada em outra despesa, lançada em/.test(texto), texto);
    check("[repetida] comprovante continua sem nota", /Nota fiscal não informada/.test(await textoDaLista(page)));
    await page.screenshot({ path: path.join(SHOTS, "nota-7-repetida.png") });
  });

  await cenario(browser, "leitura-rapida", "mockLeitura=ok&mockLeituraChave=1", async (page) => {
    await tirarFotoDoComprovante(page).catch(() => {});
    await folha(page).getByText(/Chave lida na foto/).waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, "nota-8-leitura-rapida-sugere.png") });
    await folha(page).getByRole("button", { name: "Usar esta chave" }).click();
    await page.getByText("Chave da nota conferida.").waitFor({ timeout: 10000 });
    check("[leitura-rapida] chave da leitura rápida confirmada pelo motorista", /Chave conferida/.test(await textoDaLista(page)));
  });

  await cenario(browser, "envio-sem-nota", "", async (page) => {
    await tirarFotoDoComprovante(page);
    await folha(page).getByRole("button", { name: "Fechar" }).click();
    await main(page).getByRole("button", { name: "REGISTRAR" }).click();
    check("[envio-sem-nota] envio sem nota em nenhum comprovante é barrado", await page.getByText(/Informe a nota fiscal de um comprovante/).isVisible().catch(() => false));
  });

  await browser.close();
  console.log(results.join("\n"));
  process.exitCode = results.some((line) => line.startsWith("FAIL")) ? 1 : 0;
})();
