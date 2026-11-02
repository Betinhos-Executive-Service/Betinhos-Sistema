// Animações e fluxo de uso: campo que abre com altura animada, Enter do telefone para o e-mail, botão discreto até haver
// o que salvar, aviso ao sair com dados digitados, rolagem para o próximo incompleto, check do "Tudo pronto",
// movimento reduzido. Uso: node test/fluxo.e2e.mjs "http://127.0.0.1:52418/#t=<43 caracteres>" [pasta-prints]
import { abrirNavegador, devices } from "./navegador.mjs";
const [url, prints] = process.argv.slice(2);
const b = await abrirNavegador();
const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
const novaPagina = async (opcoes = {}) => (await b.newContext({ ...devices["Pixel 7"], ...opcoes })).newPage();
const cor = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);
const json = (corpo) => ({ status: 200, contentType: "application/json", body: JSON.stringify(corpo) });
const pass = (i, extra = {}) => ({ id: `00000000-0000-0000-0000-00000000000${i}`, primeiroNome: `Pax${i}`, temFoto: false, foto: null, temTelefone: false, temEmail: false, ...extra });
const completo = { temFoto: true, temTelefone: true, telefoneMascarado: "(11) •••••-0000", temEmail: true, emailMascarado: "pa•••@x.com" };

// 1. Botão discreto sem nada a salvar; ganha destaque ao digitar (transição de cor)
let p = await novaPagina();
await p.goto(url); await p.waitForSelector(".card:not(.sk-card)");
const carlos = p.locator(".card").nth(1), botao = carlos.locator(".btn.primario");
const antes = await cor(botao);
await carlos.locator("input[type=tel]").fill("11987654321");
await p.waitForTimeout(350);
const depois = await cor(botao);
ok(antes !== depois && depois === "rgb(0, 26, 61)", `botão deveria ficar azul-marinho ao digitar: ${antes} -> ${depois}`);

// 2. Enter no telefone válido segue para o e-mail; no e-mail salva
await carlos.locator("input[type=tel]").press("Enter");
ok((await p.evaluate(() => document.activeElement.type)) === "email", "Enter no telefone vai para o e-mail");
ok((await carlos.locator("input[type=tel]").getAttribute("enterkeyhint")) === "next" && (await carlos.locator("input[type=email]").getAttribute("enterkeyhint")) === "send", "enterkeyhint next/send");

// 3. Sair com dados digitados pede confirmação; sem dados, não
let dialogo = null;
p.on("dialog", (d) => { dialogo = d.type(); d.dismiss().catch(() => {}); });
await p.reload().catch(() => {});
ok(dialogo === "beforeunload", `esperava aviso ao recarregar com dados digitados, veio ${dialogo}`);
await carlos.locator("input[type=email]").fill("carlos@empresa.com.br");
await botao.click(); await carlos.locator(".aviso.ok").waitFor();
dialogo = null;
await p.reload(); await p.waitForSelector(".card:not(.sk-card)");
ok(dialogo === null, "sem dados pendentes não deve avisar ao recarregar");

// 4. "Alterar" abre o campo com altura animada (só nessa renderização) e limpa a classe depois
const mariana = p.locator(".card").nth(0);
await mariana.getByRole("button", { name: /Alterar e-mail/ }).click();
const animando = await p.evaluate(() => { const c = document.querySelector(".campo-caixa"); return c ? { abre: c.classList.contains("abre"), anim: c.getAnimations().map((a) => a.animationName) } : null; });
ok(animando?.abre && animando.anim.includes("abre-altura"), `campo deveria abrir animando: ${JSON.stringify(animando)}`);
if (prints) await p.screenshot({ path: `${prints}/6-campo-abrindo.png` });
await p.waitForTimeout(400);
ok(await mariana.locator(".campo-caixa:not(.abre)").count() === 1, "classe abre removida ao fim da animação");
await mariana.locator("input[type=email]").fill("abc"); await mariana.locator("input[type=email]").blur();
ok(await p.evaluate(() => document.querySelector(".campo-caixa").getAnimations().length) === 0, "re-render não repete a animação de abertura");

// 5. Movimento reduzido: a animação de abertura vira instantânea
const pr = await novaPagina({ reducedMotion: "reduce" });
await pr.goto(url); await pr.waitForSelector(".card:not(.sk-card)");
await pr.locator(".card").nth(0).getByRole("button", { name: /Alterar e-mail/ }).click();
const dur = await pr.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".campo-caixa")).animationDuration));
ok(dur < 0.01, `movimento reduzido deveria zerar a animação, duração ${dur}s`);

// 6. Rolagem para o próximo incompleto: 5 passageiros, só o 1º e o último incompletos, o último fora da tela
p = await novaPagina();
const comFoto = { temFoto: true };
const lista = [pass(1, comFoto), pass(2, completo), pass(3, completo), pass(4, completo), pass(5, completo), pass(6, completo), pass(7, comFoto)];
await p.route("**/api/ler", (r) => r.fulfill(json({ dataServico: new Date().toISOString(), passageiros: lista })));
await p.goto(url); await p.waitForSelector(".card:not(.sk-card)");
const primeiro = p.locator(".card").nth(0);
await primeiro.locator("input[type=tel]").fill("11987654321"); await primeiro.locator("input[type=email]").fill("pax1@empresa.com.br");
await primeiro.locator(".btn.primario").click(); await primeiro.locator(".aviso.ok").waitFor();
const y0 = await p.evaluate(() => scrollY);
await p.waitForTimeout(1900);
// O último card não chega ao topo: a página acaba antes. Basta estar à vista.
const alvo = await p.evaluate(() => ({ y: scrollY, topo: document.querySelectorAll(".card")[6].getBoundingClientRect().top }));
ok(alvo.y > y0 && alvo.topo < 600, `deveria rolar até o próximo incompleto: ${JSON.stringify({ y0, ...alvo })}`);
// Re-salvar quem já estava completo não rola a tela
await p.evaluate(() => scrollTo(0, 0));
const yAntes = await p.evaluate(() => scrollY);
await primeiro.getByRole("button", { name: /Alterar telefone/ }).click();
await primeiro.locator("input[type=tel]").fill("11911112222");
await primeiro.locator(".btn.primario").click(); await primeiro.locator(".aviso.ok").waitFor();
await p.waitForTimeout(1800);
ok((await p.evaluate(() => scrollY)) === yAntes, "re-salvar passageiro já completo não deve rolar a tela");
await p.evaluate(() => scrollTo(0, 0));
const ultimo = p.locator(".card").nth(6);
await ultimo.locator("input[type=tel]").fill("11987654321"); await ultimo.locator("input[type=email]").fill("pax7@empresa.com.br");
await ultimo.locator(".btn.primario").click(); await ultimo.locator(".aviso.ok").waitFor();
await p.waitForTimeout(1500);
ok(await ultimo.locator(".badge.pop").count() === 1, "badge Completo faz o pop ao completar");
ok(await p.locator(".final").count() === 1, "mostra Tudo pronto ao completar todos");
const anim = await p.locator(".final").first().evaluate((e) => e.getAnimations({ subtree: true }).map((a) => a.animationName));
ok(anim.includes("traco"), `o check deve se desenhar: ${anim}`);
// 7. Foto automática com a rede fora: a foto fica pendente, o botão "Salvar foto" tenta de novo e funciona
const pf = await novaPagina();
await pf.goto(url); await pf.waitForSelector(".card:not(.sk-card)");
await pf.route("**/api/salvar", (r) => r.abort("internetdisconnected"));
const cardFoto = pf.locator(".card").nth(2);
await cardFoto.locator(".foto-input").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await pf.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 600; c.height = 450; c.getContext("2d").fillRect(0, 0, 600, 450);
  return [...new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg"))).arrayBuffer())];
})) });
await cardFoto.locator(".aviso.erro").waitFor({ timeout: 20000 });
ok((await cardFoto.locator(".btn.primario").textContent()) === "Salvar foto", "falhou: o botão Salvar foto deve continuar");
ok(await cardFoto.locator(".foto.nova").count() === 1, "falhou: a foto fica marcada como nova (pendente)");
await pf.unroute("**/api/salvar");
await cardFoto.locator(".btn.primario").click(); await cardFoto.locator(".aviso.ok").waitFor();
ok((await cardFoto.locator(".aviso").textContent()).trim() === "Foto salva.", "o botão salva a foto pendente");
console.log(JSON.stringify({ antes, depois, animando, dur, anim, falhas }));
await b.close();
process.exit(falhas.length ? 1 : 0);
