// Envio e erros: campo vazio aponta o campo e foca; e-mail inválido; rede caindo no meio do envio (retentativa sozinha,
// sem perder o que foi digitado); ordem do teclado; console sem erro (CSP inclusa).
// Uso: node test/envio.e2e.mjs "http://127.0.0.1:52418/#t=<43 caracteres>" [pasta-prints]
import { abrirNavegador, devices } from "./navegador.mjs";
const [url, prints] = process.argv.slice(2);
const b = await abrirNavegador();
const ctx = await b.newContext({ ...devices["Pixel 7"] });
const p = await ctx.newPage();
const console_ = [];
p.on("console", (m) => { if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) console_.push(m.text()); }); // as quedas de rede são simuladas aqui
p.on("pageerror", (e) => console_.push(String(e)));
const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
const foco = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : ""; });

await p.goto(url); await p.waitForSelector(".card:not(.sk-card)");
const carlos = p.locator(".card").nth(1);
const print = async (n) => { if (prints) await p.screenshot({ path: `${prints}/${n}.png` }); };

// 1. Salvar com tudo vazio → erro ao lado do telefone e foco nele
await carlos.locator(".btn.primario").click();
await p.waitForTimeout(100);
ok((await carlos.locator(".msg-campo.erro").first().textContent()) === "Informe o telefone com DDD.", "erro ao lado do telefone");
const f1 = await foco();
ok(f1.startsWith("tel-"), `foco deveria ir ao telefone, foi ${f1}`);
await print("3-campo-vazio");

// 2. E-mail inválido → erro no campo e foco nele; telefone válido mantido
const tel = carlos.locator("input[type=tel]"), mail = carlos.locator("input[type=email]");
await tel.fill("11987654321"); await mail.fill("abc");
await carlos.locator(".btn.primario").click();
await p.waitForTimeout(100);
ok((await mail.getAttribute("aria-invalid")) === "true", "e-mail inválido marcado");
ok((await foco()).startsWith("mail-"), "foco no e-mail inválido");
ok((await tel.inputValue()) === "(11) 98765-4321", "telefone mascarado e mantido");

// 3. Rede cai no meio do envio: as 2 primeiras tentativas falham; a 3ª passa. Nada digitado se perde.
let tentativas = 0;
await p.route("**/api/salvar", (r) => { tentativas++; return tentativas < 3 ? r.abort("internetdisconnected") : r.continue(); });
await mail.fill("carlos@empresa.com.br");
await carlos.locator(".btn.primario").click();
await carlos.locator(".aviso.info").waitFor();
ok(/Tentando de novo \(2 de 3\)/.test(await carlos.locator(".aviso").textContent()), "aviso de retentativa");
ok((await mail.inputValue()) === "carlos@empresa.com.br", "e-mail mantido durante a retentativa");
await print("5-rede-caiu");
await carlos.locator(".aviso.ok").waitFor({ timeout: 15000 });
ok(tentativas === 3, `esperava 3 tentativas, houve ${tentativas}`);
ok((await carlos.locator(".aviso").textContent()).includes("Telefone e e-mail salvos."), "salvou após a retentativa");
ok((await carlos.locator(".badge").textContent()) === "Completo", "badge Completo");
await print("5-rede-voltou");
await p.unroute("**/api/salvar");

// 4. Rede fora de vez (3 falhas): mensagem clara, valores mantidos, botão continua
const bia = p.locator(".card").nth(2);
await p.route("**/api/salvar", (r) => r.abort("internetdisconnected"));
await bia.locator("input[type=email]").fill("bia@empresa.com.br");
await bia.locator(".btn.primario").click();
await bia.locator(".aviso.erro").waitFor({ timeout: 20000 });
ok((await bia.locator(".aviso").textContent()).startsWith("Não conseguimos enviar."), "mensagem de falha de envio");
ok((await bia.locator("input[type=email]").inputValue()) === "bia@empresa.com.br", "e-mail mantido após falha");
ok((await bia.locator(".btn.primario").textContent()) === "Salvar e-mail", "botão pronto para tentar de novo");
await p.unroute("**/api/salvar");

// 5. Aparelho offline de verdade: faixa aparece; Salvar espera a rede voltar (evento online) e conclui sozinho
await ctx.setOffline(true); await p.waitForTimeout(100);
ok(await p.locator("#offline").isVisible(), "faixa offline visível");
await bia.locator(".btn.primario").click();
await bia.locator(".aviso.info").waitFor();
await ctx.setOffline(false);
const t0 = Date.now();
await bia.locator(".aviso.ok").waitFor({ timeout: 1500 });
ok(Date.now() - t0 < 1500, "retomou assim que a rede voltou");
ok(!(await p.locator("#offline").isVisible()), "faixa offline some");

// 6. Teclado: Tab percorre foto → Alterar/campos → Salvar na ordem do card; nomes acessíveis
const primeiro = await p.evaluate(() => document.querySelectorAll(".card")[1].querySelector("input, button, a").getAttribute("aria-label"));
ok(primeiro?.includes("foto de Carlos"), `primeiro foco do card é a foto: ${primeiro}`);
await p.locator("#foto-00000000-0000-0000-0000-000000000003").focus();
const ordem = [];
for (let i = 0; i < 4; i++) { await p.keyboard.press("Tab"); ordem.push(await foco()); }
// Beatriz já salvou o e-mail no passo 5: foto → telefone → "Alterar e-mail" → Salvar
ok(ordem[0].startsWith("tel-") && ordem[1] === "btn-texto" && ordem[2].includes("btn primario"), `ordem do Tab: ${ordem.join(" > ")}`);
const rotulos = await p.evaluate(() => [...document.querySelectorAll("input[type=tel], input[type=email]")].map((i) => i.labels?.[0]?.textContent));
ok(rotulos.every((r) => /^(Telefone|E-mail) de /.test(r || "")), `rótulos dos campos: ${rotulos}`);

// 7. Link vencido via hashchange (relê o token) com contato configurado → botões de WhatsApp e e-mail
await p.evaluate(() => { const a = document.getElementById("app"); a.dataset.whatsapp = "5511900000000"; a.dataset.email = "contato@exemplo.test"; location.hash = "#t=curto"; });
await p.locator(".estado").waitFor();
const acoes = await p.locator(".estado .acoes a").evaluateAll((as) => as.map((a) => [a.textContent, a.href]));
ok(acoes.length === 2 && acoes[0][1].startsWith("https://wa.me/5511900000000?") && acoes[1][1].startsWith("mailto:contato@exemplo.test"), `ações de contato: ${JSON.stringify(acoes)}`);
await print("4-link-vencido-contato");

ok(console_.length === 0, `console com erros: ${console_.slice(0, 3).join(" | ")}`);
console.log(JSON.stringify({ tentativas, ordem, falhas }));
await b.close();
process.exit(falhas.length ? 1 : 0);
