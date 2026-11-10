// Roteiro headless da tela Treinamentos em modo mock local (sem Xrm), 375 px.
// Uso: APP_MOTORISTAS_URL=http://127.0.0.1:<porta> [CHROME_PATH=<chromium>] node scripts/qa/verify-treinamentos.cjs <pasta-evidencias>
// Cobre: Home (card + pendência), lista, confirmar leitura ao rolar, assinatura, quiz (reprova 66, refaz, aprova), Concluídos, reabrir, estado vazio, falha ao gravar.
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  for (const candidate of ["playwright-core", "playwright"]) {
    try { return require(candidate); } catch { /* tenta o próximo */ }
  }
  throw new Error("playwright-core não encontrado. Use NODE_PATH apontando para um node_modules que o tenha ou `npx -y -p playwright-core@1.56.1`.");
}

const { chromium } = loadPlaywright();
const BASE = `${process.env.APP_MOTORISTAS_URL || "http://127.0.0.1:36487"}/webresource-app-motoristas.html`;
const SHOTS = path.resolve(process.argv[2] || ".verificacao/treinamentos");
const results = [];
const issues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
// Anexos e vídeo apontam para SharePoint/YouTube: fora da rede do mock, falham de propósito (caso de borda "anexo que não carrega").
const EXTERNAL = /sharepoint\.com|youtube|ytimg|googlevideo|doubleclick|favicon\.ico/;
// Aviso do Chromium headless sem GPU, não do app.
const IGNORED_CONSOLE = /WebGPU/;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  // O tour abriria sozinho na primeira visita de cada tela; aqui o alvo é a tela em si.
  await context.addInitScript(() => { try { localStorage.setItem("app-motoristas-tour-v2:localhost-driver:*", "visto"); } catch { /* sem storage */ } });
  const page = await context.newPage();
  page.on("response", (r) => { if (r.status() >= 400 && !EXTERNAL.test(r.url())) issues.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("requestfailed", (r) => { if (!EXTERNAL.test(r.url())) issues.push(`FALHA ${r.url()}`); });
  page.on("console", (m) => {
    if (!["error", "warning"].includes(m.type())) return;
    if (EXTERNAL.test(m.location().url || "") || EXTERNAL.test(m.text()) || IGNORED_CONSOLE.test(m.text())) return;
    issues.push(`${m.type()}: ${m.text().slice(0, 160)}`);
  });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const main = () => page.locator("main").last();
  const text = async () => (await main().innerText().catch(() => "")).replace(/\s+/g, " ");
  const waitText = async (pattern, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (pattern.test(await text())) return true;
      await page.waitForTimeout(150);
    }
    return false;
  };
  const scrollDetail = () => page.evaluate(() => { const el = document.querySelector(".trn-detail"); if (el) el.scrollTo(0, el.scrollHeight); });
  const primary = () => main().locator(".termo-primary");
  // Espera o IntersectionObserver marcar o fim do conteúdo como visto.
  const primaryEnabled = () => primary().and(page.locator(":not([disabled])")).waitFor({ timeout: 8000 }).then(() => true, () => false);
  const back = () => main().locator(".services-nav-button--home").first();
  const sign = async () => {
    const pad = main().locator(".comunicado-signature-pad");
    const box = await pad.boundingBox();
    await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 30 + i * (box.width - 60) / 12, box.y + box.height * (0.6 + 0.25 * Math.sin(i)));
    await page.mouse.up();
  };
  const answer = async (letters) => {
    const perguntas = main().locator(".trn-pergunta");
    for (let i = 0; i < letters.length; i += 1) await perguntas.nth(i).locator(".trn-alternativa").nth(letters[i]).click();
  };

  try {
    // 1. Home: card e pendência.
    await page.goto(`${BASE}?t=${Date.now()}#inicio`);
    check("home: card Treinamentos com 2 pendentes", await waitText(/Treinamentos/) && (await main().locator('[data-tour="treinamentos"]').getAttribute("aria-label")) === "Treinamentos, 2 pendentes");
    check("home: pendência '2 treinamentos para fazer'", /2 treinamentos para fazer/.test(await text()));
    await shot("01-home");

    // 2. Lista.
    await main().locator('[data-tour="treinamentos"]').click();
    check("lista: 2 pendentes com status Novo", await waitText(/Pendentes\s*2/) && (await main().locator(".trn-row").count()) === 2 && (await main().locator(".trn-row .termo-badge", { hasText: "Novo" }).count()) === 2);
    check("lista: fora do público não aparece", !/Fora do público/.test(await text()));
    check("lista: exigências e prazo no cartão", /Assinatura · Quiz/.test(await text()) && /Até 15\/12\/2026/.test(await text()));
    await shot("02-lista-pendentes");

    // 3. Treinamento sem exigências: confirmar leitura conclui.
    await main().locator(".trn-row", { hasText: "Direção defensiva" }).click();
    check("detalhe: registrou abertura (botão só depois de rolar)", await waitText(/Role até o fim|Leu tudo/));
    const antesDeRolar = await primary().isDisabled();
    await shot("03-detalhe-topo");
    check("detalhe: vídeo inválido para embed vira link", /Abrir vídeo do treinamento/.test(await text()));
    check("detalhe: anexos listados (PDF e foto)", /Guia rápido\.pdf/.test(await text()) && /Ponto cego\.jpg/.test(await text()));
    check("detalhe: vídeo próprio (.mp4) vira player nativo", (await main().locator(".trn-anexo--video video[controls], .trn-anexo--video a.trn-link").count()) === 1 && /Manobra de ré\.mp4/.test(await text()));
    await scrollDetail();
    check("detalhe: 'Confirmar leitura' habilita ao chegar ao fim", await waitText(/Leu tudo\? Confirme/) && await primaryEnabled(), antesDeRolar ? "estava desativado antes de rolar" : "conteúdo coube na tela; já estava habilitado");
    check("detalhe: anexo de imagem que não carrega vira link", await waitText(/A imagem não carregou aqui/, 6000));
    await shot("04-confirmar-leitura");
    await primary().click();
    check("sem exigências: conclui ao confirmar leitura", await waitText(/Treinamento concluído/) && /Concluído em \d\d\/\d\d\/\d{4}/i.test(await text()));
    await page.waitForTimeout(600);
    check("concluído: check verde desenhado", (await main().locator(".termo-check path").evaluate((el) => getComputedStyle(el).strokeDashoffset)) === "0px", await main().locator(".termo-check path").evaluate((el) => getComputedStyle(el).strokeDashoffset));
    check("concluído: sem alerta de erro na tela", !/Falha ao carregar recurso/.test(await page.locator("body").innerText()));
    await scrollDetail();
    await shot("05-concluido-simples");
    await back().click();
    check("lista: concluído sai de Pendentes", await waitText(/Pendentes\s*1/) && (await main().locator(".trn-row").count()) === 1);

    // 4. Treinamento com assinatura e quiz.
    await main().locator(".trn-row", { hasText: "Atendimento premium" }).click();
    await waitText(/Role até o fim|Leu tudo/);
    check("detalhe: selos de assinatura e quiz", /Assinatura obrigatória/.test(await text()) && /Quiz · nota mínima 70%/.test(await text()));
    check("detalhe: vídeo do YouTube embutido", (await main().locator(".trn-video iframe").count()) === 1);
    await scrollDetail();
    await waitText(/Leu tudo\? Confirme/);
    await primaryEnabled();
    await primary().click();
    check("assinatura: aparece só depois da leitura confirmada", await waitText(/Assine com o dedo aqui/) && /em seu nome: Renan/.test(await text()));
    check("assinatura: a seção recebe o foco ao entrar", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Assinatura"));
    check("assinatura: 'Assinar' desativado sem traço", await primary().isDisabled());
    await scrollDetail();
    await shot("06-assinatura");
    await sign();
    check("assinatura: 'Assinar' habilita após desenhar", !(await primary().isDisabled()));
    await primary().click();
    check("quiz: aparece só depois de assinar (não concluiu)", await waitText(/Enviar respostas/) && !/Treinamento concluído/.test(await text()));
    check("quiz: a seção recebe o foco ao entrar", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Quiz"));
    check("quiz: 3 perguntas e envio desativado sem respostas", (await main().locator(".trn-pergunta").count()) === 3 && (await primary().isDisabled()));
    await scrollDetail();
    await shot("07-quiz");
    await answer([1, 0, 2]); // q1 certa, q2 certa, q3 errada → 66%
    await scrollDetail();
    await primary().click();
    check("quiz: 2 de 3 reprova com 66% e oferece refazer", await waitText(/acertou 2 de 3 \(66%\)/) && /Refazer quiz/.test(await text()));
    await scrollDetail();
    await shot("08-quiz-reprovado");
    await main().getByRole("button", { name: "Refazer quiz" }).click();
    await waitText(/Enviar respostas/);
    await page.waitForTimeout(150);
    check("quiz: Refazer leva o foco de volta ao quiz", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Quiz"));
    await answer([1, 0, 1]);
    await scrollDetail();
    await primary().click();
    check("quiz: 3 de 3 aprova e conclui (100%, 2 tentativas, assinatura)", await waitText(/Treinamento concluído/) && /100% · aprovado/.test(await text()) && /2 tentativas/.test(await text()) && /Assinado por Renan/i.test(await text()) && (await main().locator(".trn-assinatura svg polyline").count()) >= 1);
    await scrollDetail();
    await shot("09-concluido-quiz");

    // 5. Histórico e reabertura.
    await main().getByRole("button", { name: "Voltar para treinamentos" }).click();
    check("lista: nada pendente após concluir os dois", await waitText(/Nenhum treinamento pendente/));
    await shot("10-pendentes-vazio");
    await main().getByRole("tab", { name: /Concluídos/ }).click();
    await page.waitForTimeout(300); // entrada do painel (160 ms)
    check("histórico: 2 concluídos com data e nota", await waitText(/Concluído em \d\d\/\d\d\/\d{4}/i) && (await main().locator(".trn-row").count()) === 2 && /Nota 100%/.test(await text()));
    await shot("11-lista-concluidos");
    const antes = await text();
    await main().locator(".trn-row", { hasText: "Atendimento premium" }).click();
    check("reabrir concluído: mostra o resumo, sem botão de ação", await waitText(/Treinamento concluído/) && (await main().locator(".trn-step").count()) === 0);
    await shot("12-reabrir-concluido");
    await back().click();
    await main().getByRole("tab", { name: /Concluídos/ }).click();
    await waitText(/Concluído em/i);
    check("reabrir concluído: participação não muda (mesmos dados na lista)", (await text()) === antes);

    // 6. Estado vazio e Home sem pendência.
    await page.goto(`${BASE}?mockTreinamentos=vazio&t=${Date.now()}#treinamentos`);
    check("estado vazio: mensagem sem treinamentos", await waitText(/Nenhum treinamento pendente/));
    await shot("13-estado-vazio");
    await page.goto(`${BASE}?mockTreinamentos=vazio&t=${Date.now()}#inicio`);
    await waitText(/Treinamentos/);
    check("home: sem pendência quando não há treinamentos", (await main().locator('[data-tour="treinamentos"]').getAttribute("aria-label")) === "Treinamentos" && !/treinamento.* para fazer/.test(await text()));

    // 7. Falha ao gravar: alerta, botão volta ao normal, nada muda.
    await page.goto(`${BASE}?mockTreinamentoErro=gravar&t=${Date.now()}#treinamentos`);
    await waitText(/Pendentes\s*2/);
    await main().locator(".trn-row", { hasText: "Direção defensiva" }).click();
    check("falha ao gravar: abertura falha com alerta, sem travar a leitura", await waitText(/Não foi possível registrar a abertura/) && (await main().locator('[role="alert"]').count()) === 1);
    check("falha ao gravar: erro da abertura fica no topo, junto do título, com Tentar de novo", (await main().locator(".trn-title + [role=\"alert\"] button", { hasText: "Tentar de novo" }).count()) === 1);
    await main().locator(".trn-title + [role=\"alert\"] button", { hasText: "Tentar de novo" }).click();
    check("falha ao gravar: Tentar de novo refaz a gravação e o erro volta", await waitText(/Não foi possível registrar a abertura/));
    await scrollDetail();
    await waitText(/Leu tudo\? Confirme/);
    await primary().click();
    check("falha ao gravar: confirmar leitura mostra o erro e o botão volta", await waitText(/Não foi possível confirmar a leitura/) && !/Falha simulada/.test(await text()) && !(await primary().isDisabled()) && !/Treinamento concluído/.test(await text()));
    await scrollDetail();
    await shot("14-falha-gravar");
    await back().click();
    check("falha ao gravar: participação segue Nova na lista", await waitText(/Pendentes\s*2/) && (await main().locator(".trn-row .termo-badge", { hasText: "Novo" }).count()) === 2);
  } catch (error) {
    check("roteiro executou até o fim", false, String(error && error.message || error).slice(0, 200));
    await shot("erro").catch(() => {});
  }

  check("console e rede sem erros (fora SharePoint/YouTube)", issues.length === 0, issues.slice(0, 5).join(" | "));
  await browser.close();
  const report = results.join("\n");
  fs.writeFileSync(path.join(SHOTS, "resultado.txt"), `${report}\n`);
  console.log(report);
  process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
})();
