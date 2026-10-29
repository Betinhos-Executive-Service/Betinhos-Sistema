// Roteiro headless da cobrança por QR (Stripe) em modo mock local (sem Xrm), em 375x812.
// Uso: node scripts/qa/verify-qr-charge.cjs <pasta-evidencias>
// Requer o dev server em APP_MOTORISTAS_URL (padrão http://localhost:31877) e Google Chrome instalado.
// O mock (src/lib/qrChargeMock.ts) paga 5 s depois de gerar (?mockPagaEm=<s> muda) e guarda as cobranças no
// sessionStorage, então o resumo reconhece o pagamento depois de recarregar.
// As verificações esperam a condição (com prazo) em vez de pausas fixas: com a máquina carregada a tela pode
// demorar mais que a pausa, e o pagamento do mock (consultado a cada 3 s) não pode chegar antes do passo que o precede.
// Ao trocar de passo o "Passo N de 5" muda antes do conteúdo: a espera inclui um texto do conteúdo do passo.
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
const SHOTS = path.resolve(process.argv[2] || ".verificacao/qr-charge");
const results = [];
const consoleIssues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const newPage = async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    page.on("response", (response) => { if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) consoleIssues.push(`HTTP ${response.status()} ${response.url()}`); });
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      // Clique por script não é gesto do usuário: o Chrome bloqueia a vibração (esperado; no aparelho vibra).
      if (/navigator\.vibrate/.test(message.text())) return;
      if ((message.location().url || "").endsWith("/favicon.ico")) return;
      consoleIssues.push(`${message.type()}: ${message.text().slice(0, 160)}`);
    });
    return page;
  };

  const helpers = (page) => {
    const main = () => page.locator("main").last();
    const text = () => main().innerText().catch(() => "");
    const until = async (condition, timeout = 10000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await condition().catch(() => false)) return true;
        await page.waitForTimeout(200);
      }
      return false;
    };
    const waitForText = (pattern, timeout = 10000) => until(async () => pattern.test(await text()), timeout);
    const button = (name) => main().getByRole("button", { name, exact: typeof name === "string" }).last();
    const visible = (name, timeout = 10000) => button(name).waitFor({ state: "visible", timeout }).then(() => true, () => false);
    const click = async (name, wait = 450) => { await button(name).click(); await page.waitForTimeout(wait); };
    const hash = () => page.evaluate(() => location.hash);
    const active = () => page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}|${el.getAttribute("type") || ""}|${(el.textContent || "").trim().slice(0, 40)}` : "";
    });
    const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    // ?t= força recarregar (só trocar o hash não recarrega o app).
    const open = async (query, hashValue, wait = 1400) => {
      await page.goto(`${BASE}${query ? query + "&" : "?"}t=${Date.now()}#${hashValue}`);
      await page.waitForTimeout(wait);
    };
    const hashStartsWith = (prefix, timeout) => until(async () => (await hash()).startsWith(prefix), timeout);
    return { main, text, until, waitForText, button, visible, click, hash, hashStartsWith, active, shot, open };
  };

  // ---------- Fluxo A: valor total, outra pessoa, e-mail, inglês, pago → direto para finalizar ----------
  {
    const page = await newPage();
    const h = helpers(page);
    const queryA = "?mockPagaEm=10";
    await h.open(queryA, "inicio", 400);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await h.open(queryA, "receber?serviceId=10240&type=SERVICO");
    check("Recebimento 10240 mostra 'Cobrar por QR code'", await h.visible("Cobrar por QR code"));
    await h.shot("01-recebimento");

    await h.click("Cobrar por QR code");
    const amount = page.locator("#qr-charge-amount");
    await h.until(async () => (await amount.inputValue()) === "380,00" && (await h.active()).startsWith("input#qr-charge-amount"));
    check("Passo 1 de 5 com o valor do saldo e foco no campo", /Passo 1 de 5/.test(await h.text()) && (await amount.inputValue()) === "380,00" && (await h.active()).startsWith("input#qr-charge-amount"), await h.active());
    await h.shot("02-passo1-valor");
    await amount.fill("500");
    await h.click("Confirmar");
    check("Valor acima do saldo é bloqueado", await h.waitForText(/O valor não pode passar de R\$\s380,00\./));
    await amount.fill("380");
    await amount.press("Enter");
    await h.waitForText(/Passo 2 de 5[\s\S]*Quem vai pagar/);
    check("Enter avança para o passo 2 (Quem vai pagar)", /Passo 2 de 5/.test(await h.text()) && /Quem vai pagar/.test(await h.text()));
    await h.shot("03-passo2-pagante");

    await h.click(/Outra pessoa/);
    await h.until(async () => (await h.active()).startsWith("input"));
    check("'Outra pessoa' abre o campo de nome com foco", (await h.active()).startsWith("input"), await h.active());
    await h.click("Continuar");
    check("Nome vazio: 'Informe quem vai pagar.'", await h.waitForText(/Informe quem vai pagar\./));
    await main(page).getByLabel(/Nome de quem vai pagar/).fill("John Smith");
    await page.keyboard.press("Enter");
    await h.until(async () => /Passo 3 de 5/.test(await h.text()) && (await h.active()).includes("|email|"));
    check("Passo 3 de 5 (e-mail) com teclado de e-mail", /Passo 3 de 5/.test(await h.text()) && (await h.active()).includes("|email|"), await h.active());

    const email = main(page).getByLabel(/^E-mail/);
    await email.fill("x@mail");
    await h.shot("04a-passo3-email");
    await h.click("Continuar");
    check("E-mail inválido: 'Confira o e-mail.'", await h.waitForText(/Confira o e-mail\./));
    await h.click("Voltar");
    await h.waitForText(/Passo 2 de 5/);
    const keptName = await main(page).getByLabel(/Nome de quem vai pagar/).inputValue().catch(() => "");
    check("Voltar preserva o que foi preenchido (nome)", keptName === "John Smith", keptName);
    await h.click("Continuar");
    await h.waitForText(/Passo 3 de 5/);
    check("Voltar e avançar preserva o e-mail digitado", (await main(page).getByLabel(/^E-mail/).inputValue()) === "x@mail");
    await main(page).getByLabel(/^E-mail/).fill("john@mail.com");
    await h.click("Continuar");
    await h.waitForText(/Passo 4 de 5[\s\S]*Español/);
    check("Passo 4 de 5: idioma com Português/English/Español", /Passo 4 de 5/.test(await h.text()) && /English/.test(await h.text()) && /Español/.test(await h.text()) && /do pagamento/.test(await h.text()));
    await h.shot("04-passo4-idioma");
    await h.click(/English/);
    check("Escolher idioma não avança sozinho", /Passo 4 de 5/.test(await h.text()));
    await h.click("Continuar");
    await h.waitForText(/Passo 5 de 5[\s\S]*John Smith/);
    const review = await h.text();
    check("Revisão: valor, pagante, e-mail e idioma", /Passo 5 de 5/.test(review) && /R\$\s380,00/.test(review) && /John Smith/.test(review) && /john@mail\.com/.test(review) && /English/.test(review), review.replace(/\s+/g, " ").slice(0, 200));
    await h.shot("05-passo5-revisao");
    await h.click(/^Valor:/);
    check("Item da revisão volta ao passo dele", await h.waitForText(/Passo 1 de 5/));
    await h.click("Confirmar");
    check("Confirmar o passo editado volta direto à revisão", await h.waitForText(/Passo 5 de 5[\s\S]*john@mail\.com/));

    // Paga 10 s depois de gerar: o QR aberto é conferido bem antes do pagamento.
    await h.click("Gerar QR code");
    await h.waitForText(/Aguardando pagamento\.[\s\S]*Payment for your service/);
    check("QR em inglês aguardando pagamento", /Aguardando pagamento\./.test(await h.text()) && /Payment for your service/.test(await h.text()) && await page.locator(".qr-charge-code").isVisible());
    await h.shot("06-qr-aberto");
    const confirmed = await h.waitForText(/Pagamento confirmado/, 20000);
    await h.waitForText(/Enviado para john@mail\.com/, 3000);
    const done = await h.text();
    check("Confirmação: valor, pagante, horário e recibo", confirmed && /R\$\s380,00/.test(done) && /John Smith/.test(done) && /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(done) && /Enviado para john@mail\.com/.test(done), done.replace(/\s+/g, " ").slice(0, 220));
    check("Confirmação não avança sozinha", (await h.hash()).startsWith("#cobranca-qr"));
    check("Sem texto sobre liberar o passageiro", !/liberar/i.test(done));
    await h.shot("07-confirmado");
    await h.click("Continuar");
    check("Pago no total: Continuar vai direto para #finalizar", await h.hashStartsWith("#finalizar") && !/Comprovante\(s\) de pagamento/i.test(await h.text()), await h.hash());
    await h.shot("08-finalizar");

    // Recarregar: o resumo (mock no sessionStorage) continua reconhecendo o pagamento.
    await h.open(queryA, "receber?serviceId=10240&type=SERVICO");
    await h.waitForText(/Já pago por QR[\s\S]*Comprovante opcional/);
    const after = await h.text();
    check("Recarregar: Recebimento reconhece o pago pelo resumo", /Já pago por QR[\s\S]*R\$\s380,00[\s\S]*Tudo recebido[\s\S]*Comprovante opcional/.test(after) && !(await h.button("Cobrar por QR code").count()), after.replace(/\s+/g, " ").slice(0, 200));
    await h.shot("09-recarregado-pago");

    await h.open(queryA, "receber?serviceId=10241&type=SERVICO");
    check("Serviço sem valor a receber (10241) não mostra o QR", !(await h.button("Cobrar por QR code").count()));
    await page.context().close();
  }

  // ---------- Fluxo B: parcial, pagante da lista, Pular e-mail, retomar cobrança aberta, cartão recusado ----------
  {
    const page = await newPage();
    const h = helpers(page);
    // Paga 15 s depois de gerar: a recusa (1ª consulta, 3 s), sair e retomar cabem com folga antes do pagamento.
    const query = "?mockPagaEm=15&mockRecusa=1";
    await h.open(query, "inicio", 400);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await h.open(query, "receber?serviceId=10240&type=SERVICO");
    await h.click("Cobrar por QR code");
    await page.locator("#qr-charge-amount").fill("200");
    await h.click("Confirmar");
    await h.waitForText(/Passo 2 de 5/);
    const firstOption = main(page).locator(".qr-charge-choice").first();
    const firstName = (await firstOption.locator("strong").innerText()).trim();
    check("Pagante da lista já vem marcado", (await firstOption.getAttribute("aria-pressed")) === "true", firstName);
    await firstOption.click();
    await page.waitForTimeout(450);
    check("Tocar no pagante não avança sozinho", /Passo 2 de 5/.test(await h.text()));
    await h.click("Continuar");
    check("Continuar leva ao e-mail", await h.waitForText(/Passo 3 de 5/));
    await h.click("Pular");
    await h.click("Continuar");
    await h.waitForText(/Passo 5 de 5[\s\S]*Sem e-mail/);
    const review = await h.text();
    check("Pular e-mail: revisão mostra 'Sem e-mail'", /Sem e-mail/.test(review) && review.includes(firstName));
    await h.click("Gerar QR code");
    await page.locator(".qr-charge-code").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    const sessionBefore = await page.locator(".qr-charge-code").getAttribute("aria-label");
    const declined = await h.waitForText(/Pagamento recusado/, 8000);
    check("?mockRecusa=1: motivo da recusa e o QR continua", declined && await page.locator(".qr-charge-code").isVisible());

    // Sai da tela com o QR aberto: o Recebimento oferece retomar.
    await page.locator(".form-menu-button[aria-label='Voltar']").click();
    check("Com cobrança aberta o botão vira 'Retomar cobrança'", await h.visible("Retomar cobrança"), (await h.text()).replace(/\s+/g, " ").slice(0, 160));
    await h.shot("10-retomar");
    await h.click("Retomar cobrança");
    check("Retomar abre direto no QR aberto", await h.waitForText(/Aguardando pagamento\./) && Boolean(sessionBefore));
    const confirmed = await h.waitForText(/Pagamento confirmado/, 20000);
    await page.waitForTimeout(400);
    check("Retomado: confirmação sem recibo quando não houve e-mail", confirmed && !/Enviado para/.test(await h.text()));
    await h.click("Continuar");
    await h.waitForText(/Envie o comprovante do restante/);
    const partial = await h.text();
    check("Pago parcial: Continuar volta ao Recebimento pedindo o restante", (await h.hash()).startsWith("#receber") && /Já pago por QR[\s\S]*R\$\s200,00[\s\S]*Falta receber\s+R\$\s180,00[\s\S]*Envie o comprovante do restante \(R\$\s180,00\)\./.test(partial), partial.replace(/\s+/g, " ").slice(0, 200));
    await h.shot("11-parcial");
    await h.click("FINALIZAR");
    check("Parcial: FINALIZAR sem foto pede comprovante", await h.waitForText(/Adicione ao menos um comprovante/));
    await h.click("Cobrar por QR code");
    check("QR novo limitado ao saldo (180,00)", await h.until(async () => (await page.locator("#qr-charge-amount").inputValue()) === "180,00"));
    await page.context().close();
  }

  // ---------- Recarregar no QR volta ao Recebimento ----------
  {
    const page = await newPage();
    const h = helpers(page);
    await h.open("", "cobranca-qr?serviceId=10240&type=SERVICO");
    check("Recarregar em #cobranca-qr volta ao Recebimento", await h.hashStartsWith("#receber"), await h.hash());
    await page.context().close();
  }

  await browser.close();
  check("Console sem erros/avisos e rede sem 4xx/5xx", consoleIssues.length === 0, consoleIssues.slice(0, 5).join(" | "));
  fs.writeFileSync(path.join(SHOTS, "resultado.txt"), results.join("\n") + "\n");
  console.log(results.join("\n"));
  process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
})();

function main(page) {
  return page.locator("main").last();
}
