// Roteiro headless dos fluxos do App Motoristas em modo mock local (sem Xrm).
// Uso: node scripts/qa/verify-ux-flows.cjs <pasta-evidencias> [servicos,formularios,comunicados]
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://localhost:31877) e Google Chrome instalado.
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  const candidates = [
    "playwright-core",
    path.join(process.env.APPDATA || "", "npm/node_modules/@playwright/cli/node_modules/playwright-core")
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Instale @playwright/cli global ou playwright-core no projeto.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://localhost:31877"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/ux-flows");
const GROUPS = new Set((process.argv[3] || "servicos,formularios,comunicados").split(","));
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const results = [];
const consoleIssues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
  // UA Android ativa a câmera ao vivo (getUserMedia), que é simulada por um canvas.
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: ANDROID_UA });
  await context.addInitScript(() => {
    const fakeCam = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      setInterval(() => { ctx.fillStyle = "#ddd"; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = "#123"; ctx.font = "40px sans-serif"; ctx.fillText("FOTO " + frame++, 60, 240); }, 100);
      return canvas.captureStream(10);
    };
    window.__cameraMode = "allow";
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        if (window.__cameraMode === "deny") throw new DOMException("Permission denied", "NotAllowedError");
        return fakeCam();
      };
      navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake", label: "Fake", groupId: "g" }];
    }
  });
  const page = await context.newPage();
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) consoleIssues.push(`HTTP ${response.status()} ${response.url()}`); });
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    if ((message.location().url || "").endsWith("/favicon.ico")) return;
    consoleIssues.push(`${message.type()}: ${message.text().slice(0, 160)}`);
  });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const main = () => page.locator("main").last();
  const open = async (hash, wait = 1300) => { await page.goto(`${BASE}?t=${Date.now()}#${hash}`); await page.waitForTimeout(wait); };
  // Espera o estado esperado em vez de tempo fixo: a câmera simulada demora mais sob carga.
  const waitForText = async (pattern, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (pattern.test(await main().innerText().catch(() => ""))) return true;
      await page.waitForTimeout(250);
    }
    return false;
  };
  const openCameraIfIdle = async () => {
    const openButton = main().getByRole("button", { name: "Abrir câmera" });
    // O painel some sozinho quando a câmera inicia; o clique é só para o caso de ela não ter iniciado.
    if (await openButton.count()) await openButton.click({ timeout: 1500 }).catch(() => {});
  };
  const takePhoto = async (confirmLabel = "Confirmar") => {
    const shutter = main().locator(".photo-capture");
    await shutter.waitFor({ state: "visible", timeout: 10000 });
    await openCameraIfIdle();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("main")].pop()?.querySelector(".photo-capture");
      return button && !button.disabled;
    }, null, { timeout: 10000 });
    await shutter.click();
    const confirm = main().getByRole("button", { name: confirmLabel }).last();
    await confirm.waitFor({ state: "visible", timeout: 10000 });
    await confirm.click();
    await page.waitForTimeout(900);
  };

  await open("inicio", 300);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("app-motoristas-tour-v1:localhost-driver", "visto"); });
  await open("inicio");

  const stamp = await page.locator(".build-stamp").innerText();
  check("Carimbo de versão vX · dd/mm/aaaa HH:mm", /^v\d+\.\d+\.\d+ · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(stamp), stamp);

  if (GROUPS.has("servicos")) {
    // Voltar do celular volta uma tela por vez.
    await page.getByRole("button", { name: /Corridas de hoje/ }).click();
    await page.waitForTimeout(800);
    await main().getByRole("button", { name: /Base Betinhos/ }).last().click();
    await page.waitForTimeout(900);
    const hashDetail = await page.evaluate(() => location.hash);
    await page.goBack();
    await page.waitForTimeout(900);
    const back1 = await page.evaluate(() => location.hash);
    check("Voltar do celular: detalhe -> Serviços", hashDetail.startsWith("#detalhes") && back1 === "#servicos", `${hashDetail} -> ${back1}`);
    await page.goBack();
    await page.waitForTimeout(900);
    const back2 = await page.evaluate(() => location.hash);
    check("Voltar do celular: Serviços -> Início sem sair do app", back2 === "#inicio" && page.url().includes("webresource-app-motoristas"), back2);

    // Detalhe do serviço: alvos de toque, contato do passageiro e dica de rolagem.
    await page.getByRole("button", { name: /Corridas de hoje/ }).click();
    await page.waitForTimeout(800);
    await main().getByRole("button", { name: /Base Betinhos/ }).last().click();
    await page.waitForTimeout(1000);
    const sizes = await page.evaluate(() => {
      const root = [...document.querySelectorAll("main")].pop();
      const size = (selector) => { const el = root.querySelector(selector); if (!el) return null; const box = el.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; };
      return { back: size(".details-back"), copy: size(".details-copy"), destino: size('[aria-label="Abrir Destino no Google Maps"]') };
    });
    check("Detalhe: Voltar/Copiar com 44px", sizes.back?.[0] >= 44 && sizes.copy?.[0] >= 44, JSON.stringify(sizes));
    check("Detalhe: link Destino com área de toque >= 40px", sizes.destino?.[1] >= 40, JSON.stringify(sizes.destino));
    await shot("servicos-detalhe");
    const phone = main().locator(".detail-contact-link").first();
    check("Detalhe: telefone do passageiro é botão", (await phone.count()) > 0);
    if (await phone.count()) {
      await phone.click();
      await page.waitForTimeout(400);
      const text = await page.locator(".contact-choice-dialog").innerText().catch(() => "");
      check("Detalhe: escolha Ligar/WhatsApp do passageiro", /Contato do passageiro/.test(text) && /Ligar/.test(text) && /WhatsApp/.test(text), text.replace(/\n+/g, " | "));
      await shot("servicos-contato-passageiro");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    const hintBefore = await page.locator(".details-scroll-hint").count();
    await page.evaluate(() => { const scroller = [...document.querySelectorAll(".details-scroll-v1")].pop(); scroller.scrollTop = 120; scroller.dispatchEvent(new Event("scroll")); });
    await page.waitForTimeout(700);
    check("Detalhe: dica 'Mais detalhes abaixo' some após rolar", hintBefore > 0 && (await page.locator(".details-scroll-hint").count()) === 0);

    // Receber: valor visível, câmera negada com retry, foto, apagar com diálogo.
    await main().locator("textarea").first().fill("Passageiro pediu água");
    await page.waitForTimeout(300);
    await main().getByRole("button", { name: "Receber", exact: true }).click();
    await page.waitForTimeout(900);
    check("Receber: mostra o valor a receber", /R\$ 380,00/.test(await main().innerText()));
    await page.evaluate(() => { window.__cameraMode = "deny"; });
    await main().getByRole("button", { name: "Adicionar comprovante" }).click();
    if (!(await waitForText(/Câmera indisponível|Abrir câmera/))) await page.waitForTimeout(500);
    await openCameraIfIdle();
    await waitForText(/Câmera indisponível/);
    const deniedText = await main().innerText();
    check("Câmera negada: mensagem em português com 'Tentar de novo'", /Câmera indisponível/.test(deniedText) && /Permitir/.test(deniedText) && !/Permission denied/.test(deniedText), deniedText.replace(/\s+/g, " ").slice(0, 120));
    check("Câmera negada: sem aviso global duplicado", (await page.locator("text=Permission denied").count()) === 0);
    await shot("servicos-camera-negada");
    await page.evaluate(() => { window.__cameraMode = "allow"; });
    await main().getByRole("button", { name: "Tentar de novo" }).click();
    await takePhoto("Confirmar");
    await main().getByRole("button", { name: "Ver comprovante 1" }).waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    check("Receber: comprovante anexado após 'Tentar de novo'", (await main().getByRole("button", { name: "Ver comprovante 1" }).count()) === 1);
    await main().getByRole("button", { name: "Ver comprovante 1" }).click();
    await page.waitForTimeout(800);
    await main().getByRole("button", { name: "Apagar foto" }).click();
    await page.waitForTimeout(400);
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const closedByEsc = (await page.locator('[role="dialog"]').count()) === 0;
    await main().getByRole("button", { name: "Apagar foto" }).click();
    await page.waitForTimeout(400);
    await page.mouse.click(187, 60);
    await page.waitForTimeout(300);
    check("Diálogo Apagar foto: foco em Cancelar, fecha com Esc e toque fora", focused === "Cancelar" && closedByEsc && (await page.locator('[role="dialog"]').count()) === 0, `foco=${focused}`);
    await page.goBack();
    await page.waitForTimeout(900);
    await main().getByRole("button", { name: "FINALIZAR" }).click();
    await page.waitForTimeout(900);
    const finalizeText = await main().innerText();
    check("Finalizar: confirma a observação já escrita", /Confira sua observação/i.test(finalizeText) && /Enviar sem observação/.test(finalizeText));
    await shot("servicos-finalizar");

    // Voucher: sem atalho de horário agendado (removido em 22/10/2026), rótulos, formatação e limpar com confirmação.
    await open("voucher?serviceId=10241&type=SERVICO");
    check("Voucher: sem atalho 'Usar … (agendado)'", (await main().locator(".voucher-time-shortcut").count()) === 0 && !/\(agendado\)/.test(await main().innerText()));
    check("Voucher: Limpar formulário desabilitado sem dados", await main().getByRole("button", { name: "Limpar formulário" }).isDisabled());
    check("Voucher: 'Horário inicial: hora' começa vazio", /Hora/.test(await main().getByRole("button", { name: "Horário inicial: hora" }).innerText()));
    const toll = main().locator('input[placeholder="R$ 0,00"]').first();
    await toll.fill("12,5");
    await toll.blur();
    await page.waitForTimeout(200);
    check("Voucher: despesa formatada ao sair do campo", (await toll.inputValue()) === "12,50", await toll.inputValue());
    await main().getByRole("button", { name: "Limpar formulário" }).click();
    await page.waitForTimeout(300);
    const clearDialog = await page.locator('[role="dialog"]').innerText().catch(() => "");
    await page.locator('[role="dialog"]').getByRole("button", { name: "Cancelar" }).click();
    await page.waitForTimeout(300);
    check("Voucher: Limpar pede confirmação e Cancelar preserva os dados", /Limpar o voucher\?/.test(clearDialog) && (await toll.inputValue()) === "12,50");
    await shot("servicos-voucher");

    // Finalizar manutenção: valor só numérico, apagar fotos com confirmação.
    await open("finalizar?serviceId=76&type=MANUTENCAO");
    check("Manutenção: sem ícone de apagar fotos quando não há fotos", (await main().getByRole("button", { name: "Apagar fotos" }).count()) === 0);
    const value = main().getByLabel(/Valor \(R\$\)/);
    await value.pressSequentially("1.250,9abc");
    await value.blur();
    await page.waitForTimeout(200);
    check("Manutenção: valor descarta letras e formata", (await value.inputValue()) === "1250,90", await value.inputValue());
    await main().getByRole("button", { name: /Adicionar Fotos da nota fiscal/ }).click();
    await takePhoto("Confirmar");
    await main().getByRole("button", { name: "Apagar fotos" }).click();
    await page.waitForTimeout(300);
    const photoDialog = await page.locator('[role="dialog"]').innerText().catch(() => "");
    await page.locator('[role="dialog"]').getByRole("button", { name: "Apagar" }).click();
    await page.waitForTimeout(500);
    check("Manutenção: 'Apagar 1 foto?' confirma e remove só a foto", /Apagar 1 foto\?/.test(photoDialog) && (await main().getByRole("button", { name: /Ver Fotos da nota fiscal/ }).count()) === 0 && (await value.inputValue()) === "1250,90");
    await shot("servicos-manutencao");

    // Cancelado no local: limpar com confirmação.
    await open("cancelado-local?serviceId=10241&type=SERVICO");
    check("Cancelado no local: Limpar texto desabilitado vazio", await main().getByRole("button", { name: "Limpar texto" }).isDisabled());

    // Histórico: busca sem resultado.
    await open("historico");
    await main().locator('input[type="search"]').fill("zzz inexistente");
    await page.waitForTimeout(500);
    check("Histórico: busca vazia cita o termo", /Nenhum serviço encontrado para "zzz inexistente"/.test(await main().innerText()));
  }

  if (GROUPS.has("formularios")) {
    await open("manutencao");
    await main().getByRole("button", { name: "Selecionar gravidade" }).click();
    await page.waitForTimeout(400);
    const options = await page.locator('[role="option"]').allInnerTexts();
    check("Solicitar manutenção: gravidade com critério e acento", options.some((o) => /Média/.test(o) && /semana/.test(o)) && options.some((o) => /Urgente/.test(o) && /não deve rodar/.test(o)));
    await shot("formularios-gravidade");

    await open("colisoes");
    const collisionText = await main().innerText();
    check("Colisões: atalhos SAMU 192 e Polícia 190", /SAMU 192/.test(collisionText) && /Polícia 190/.test(collisionText));
    await shot("formularios-colisoes");
    await main().getByRole("button", { name: /Bateram em mim/ }).click();
    await page.waitForTimeout(900);
    const plate = main().locator('input[placeholder="Ex.: ABC1D23"]');
    await plate.fill("abc-1d23x");
    check("Colisões: placa normalizada", (await plate.inputValue()) === "ABC1D23", await plate.inputValue());

    await open("gastos");
    const expenseValue = main().getByLabel(/^Valor/);
    await expenseValue.pressSequentially("45abc,5");
    await expenseValue.blur();
    await page.waitForTimeout(200);
    check("Gastos: valor descarta letras e formata", (await expenseValue.inputValue()) === "45,50", await expenseValue.inputValue());

    await open("recibo-personalizado");
    check("Recibo: observações começam vazias", (await main().locator("textarea").first().inputValue()) === "");

    for (const route of ["gastos", "recibo-personalizado", "manutencao", "registro-colisao"]) {
      await open(route);
      await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js" });
      // O carimbo de versão é propositalmente de baixo contraste (regra Betinhos) e aria-hidden.
      const violations = await page.evaluate(async () => (await window.axe.run({ exclude: [[".build-stamp"]] }, { resultTypes: ["violations"] })).violations
        .filter((item) => ["critical", "serious"].includes(item.impact)).map((item) => `${item.impact} ${item.id}`));
      check(`axe sem Critical/Serious em #${route}`, violations.length === 0, violations.join(", "));
    }
  }

  if (GROUPS.has("comunicados")) {
    await open("comunicados");
    await main().getByRole("button", { name: /Ciência obrigatória/ }).click();
    await page.waitForTimeout(700);
    await main().getByRole("button", { name: "Assinar ciência" }).click();
    await page.waitForTimeout(400);
    check("Comunicados: erro de assinatura junto do campo", await page.evaluate(() => Boolean(document.querySelector(".comunicado-field-signature .comunicado-error"))));
    const pad = page.locator(".comunicado-signature-pad");
    const box = await pad.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 8 });
      await page.mouse.up();
    }
    await main().getByRole("button", { name: "Assinar ciência" }).click();
    await page.waitForTimeout(1500);
    check("Comunicados: ciência registrada após assinar", /Ciência registrada/.test(await main().innerText()));
    await shot("comunicados-ciencia");
  }

  check("Console e rede sem erros/avisos", consoleIssues.length === 0, consoleIssues.slice(0, 5).join(" || "));
  await shot("final");
  console.log(results.join("\n"));
  await browser.close();
  process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
})().catch((error) => {
  console.log(results.join("\n"));
  console.error("ERRO:", error.message.split("\n")[0]);
  process.exit(1);
});
