// Página do link de cadastro. Vanilla JS; o token vem do fragmento #t= e só vai ao /api no corpo.
import { TOKEN_RE, emailOculto, emailValido, mascararTelefone, telefoneOculto, telefoneParaEnvio, telefoneValido } from "./validacao.mjs";

const app = document.getElementById("app");
const lerToken = () => new URLSearchParams(location.hash.slice(1)).get("t") || "";
let token = "";
// Esqueleto (cabeçalho + 3 cards) que já veio no HTML; a cópia serve para o hashchange.
const esqueletoInicial = app.firstElementChild.cloneNode(true);
const LADO_MAX = 1280;
const BYTES_MAX = 3 * 1024 * 1024;

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONE = {
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  ok: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  falta: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
  relogio: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  link: svg('<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>'),
};

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos) if (f != null && f !== false) n.append(f);
  return n;
}

function estado(icone, titulo, texto, extra) {
  app.replaceChildren(el("section", { class: "estado", role: "status" },
    icone ? el("span", { class: `estado-icone ${icone}`, html: ICONE[icone] }) : null,
    el("h1", {}, titulo), el("p", {}, texto), extra));
}

async function lerResposta(r) {
  let dados = null;
  try { dados = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, dados };
}

function chamar(caminho, corpo) {
  return fetch(caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...corpo }),
    priority: "high",
  }).then(lerResposta);
}

// Envio com progresso (fetch não informa o upload): a foto comprimida pode ter 3 MB e levar mais de um minuto no 3G.
// `corpoJson` já serializado (a retentativa reaproveita). Rejeita com "rede" (cai para a retentativa) ou "tempo".
// O prazo é de inatividade (90 s sem o upload avançar nem resposta), não total: enquanto a foto sobe, o envio continua.
const SEM_PROGRESSO_MS = 90000;
function enviar(caminho, corpoJson, aoProgredir) {
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    let prazo;
    const renovar = () => { clearTimeout(prazo); prazo = setTimeout(() => x.abort(), SEM_PROGRESSO_MS); };
    x.open("POST", caminho);
    x.setRequestHeader("Content-Type", "application/json");
    x.responseType = "json";
    x.upload.onprogress = (e) => { renovar(); if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100)); };
    x.onloadend = () => clearTimeout(prazo);
    x.onload = () => ok({ status: x.status, dados: x.response });
    x.onerror = () => falha(new Error("rede"));
    x.onabort = () => falha(new Error("tempo")); // só este código aborta (prazo de inatividade)
    renovar();
    x.send(corpoJson);
  });
}

// Aviso de rede: some quando a conexão volta. O que foi digitado fica no estado de cada card.
const offline = document.getElementById("offline");
const atualizarRede = () => { offline.hidden = navigator.onLine !== false; };
addEventListener("online", atualizarRede);
addEventListener("offline", atualizarRede);
atualizarRede();
// Espera a conexão voltar (evento online) ou o prazo, o que vier primeiro; limpa o que não disparou.
const esperarRede = (ms) => new Promise((r) => {
  const pronto = () => { clearTimeout(t); removeEventListener("online", pronto); r(); };
  const t = setTimeout(pronto, ms);
  addEventListener("online", pronto);
});

// Tela de link vencido: contato da Betinhos vem das vars do Worker (data-whatsapp/data-email). Sem elas, só o texto.
function acoesContato() {
  const zap = app.dataset.whatsapp, mail = app.dataset.email;
  if (!zap && !mail) return null;
  const texto = encodeURIComponent("Olá! O link de cadastro do passageiro expirou. Podem gerar um novo?");
  return el("p", { class: "acoes" },
    zap ? el("a", { class: "btn primario", href: `https://wa.me/${zap}?text=${texto}`, target: "_blank", rel: "noopener" }, "Chamar no WhatsApp") : null,
    mail ? el("a", { class: "btn", href: `mailto:${mail}?subject=${encodeURIComponent("Link de cadastro do passageiro")}` }, "Enviar e-mail") : null);
}

function mostrarErroGeral(status, tentar) {
  if (status === 404 || status === 410 || status === 400) {
    estado("link", "Este link não vale mais",
      "Por segurança, o link de cadastro expira em 36 horas ou quando um novo é gerado. Peça um novo à equipe Betinhos pelo mesmo canal em que recebeu este.",
      acoesContato());
  } else if (status === 429) {
    estado("relogio", "Muitas tentativas seguidas", "Aguarde alguns minutos e abra o link de novo.");
  } else {
    estado("falta", "Não conseguimos carregar", "Confira sua conexão e tente de novo.",
      el("button", { class: "btn primario", type: "button", onclick: tentar }, "Tentar de novo"));
  }
}

// Fotos vêm de /api/foto, uma busca por passageiro por página (o "ler" volta sem fotos e responde rápido).
const fotos = new Map();
function buscarFoto(id) {
  if (!fotos.has(id)) {
    fotos.set(id, chamar("/api/foto", { passageiroId: id })
      .then((r) => (r.status === 200 ? r.dados?.foto ?? null : null), () => null));
  }
  return fotos.get(id);
}

// Reabertura instantânea: a última lista (sem fotos; nomes e contatos já mascarados) fica no aparelho por 36 h,
// na chave do hash do token. Ao abrir, mostra o que estava salvo e atualiza quando o "ler" responder.
const VALIDADE_CACHE = 36 * 3600 * 1000;
let mexeu = false;
app.addEventListener("input", () => { mexeu = true; });
app.addEventListener("change", () => { mexeu = true; });

async function chaveCache() {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return "cadastro:" + [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function lerCache(chave) {
  try {
    const c = JSON.parse(localStorage.getItem(chave) || "null");
    return c && Date.now() - c.em < VALIDADE_CACHE && Array.isArray(c.dados?.passageiros) ? c.dados : null;
  } catch { return null; }
}
function gravarCache(chave, dados) {
  try {
    const passageiros = dados.passageiros.map(({ foto, ...resto }) => resto);
    localStorage.setItem(chave, JSON.stringify({ em: Date.now(), dados: { dataServico: dados.dataServico, passageiros } }));
  } catch { /* sem armazenamento: só perde a reabertura instantânea */ }
}
function apagarCache(chave) { try { localStorage.removeItem(chave); } catch { /* idem */ } }

async function carregar() {
  token = lerToken();
  fotos.clear();
  if (!TOKEN_RE.test(token)) return mostrarErroGeral(410);
  const chave = await chaveCache().catch(() => null);
  let mostrado = chave ? lerCache(chave) : null;
  if (mostrado) renderLista(mostrado); else if (!app.querySelector(".esqueleto")) app.replaceChildren(esqueletoInicial.cloneNode(true));
  mexeu = false;
  // 1ª chamada pode vir do cache do Worker (cache: true, instantânea); aí busca a versão fresca em seguida.
  for (const fresco of [false, true]) {
    let resp;
    // A 1ª chamada já saiu do script inicial do HTML (window.__ler), antes de este módulo carregar; se falhou (null), chama de novo.
    const inicial = !fresco && await window.__ler;
    window.__ler = null;
    try { resp = await (inicial ? lerResposta(inicial) : chamar("/api/ler", fresco ? { fresco: true } : {})); } catch { return mostrado ? null : mostrarErroGeral(0, carregar); }
    if (resp.status !== 200 || !Array.isArray(resp.dados?.passageiros)) {
      if (chave && [400, 404, 410].includes(resp.status)) apagarCache(chave);
      return mostrado && resp.status >= 500 ? null : mostrarErroGeral(resp.status, carregar);
    }
    if (chave) gravarCache(chave, resp.dados);
    // Não redesenha se nada mudou nem se a pessoa já começou a preencher.
    if (!mostrado || (!mexeu && JSON.stringify(lerSemFoto(resp.dados)) !== JSON.stringify(lerSemFoto(mostrado)))) renderLista(resp.dados);
    mostrado = resp.dados;
    if (!resp.dados.cache) return;
  }
}
const lerSemFoto = (d) => ({ dataServico: d.dataServico, passageiros: d.passageiros.map(({ foto, ...r }) => r) });


function formatarData(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  const f = (o) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  const dia = f({ weekday: "long", day: "numeric", month: "long" });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, às ${f({ hour: "2-digit", minute: "2-digit" })}`;
}

const completo = (p) => Boolean(p.temFoto && p.temTelefone && p.temEmail);

function statusDe(p) {
  if (completo(p)) return { tipo: "ok", texto: "Completo" };
  const faltaContato = !(p.temTelefone && p.temEmail);
  if (!p.temFoto && faltaContato) return { tipo: "atencao", texto: "Faltam foto e contato" };
  return { tipo: "atencao", texto: p.temFoto ? "Falta contato" : "Falta foto" };
}

const listaNatural = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}` : itens[0] || "");
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function renderLista({ passageiros, dataServico }) {
  if (!passageiros.length) return estado("falta", "Nenhum passageiro neste link", "Fale com a equipe Betinhos para conferir o serviço.");
  const data = formatarData(dataServico);
  const um = passageiros.length === 1;
  const progresso = el("div", { class: "progresso", role: "status" });
  const atualizarProgresso = () => {
    const feitos = passageiros.filter(completo).length;
    progresso.replaceChildren(
      feitos === passageiros.length
        ? el("p", { class: "final" }, el("span", { class: "final-icone", html: ICONE.ok }), "Tudo pronto. Obrigado!")
        : el("p", { class: "progresso-texto" }, `${feitos} de ${passageiros.length} completo${um ? "" : "s"}`),
      um ? null : el("div", { class: "barra", "aria-hidden": "true" }, ...passageiros.map((p) => el("span", { class: completo(p) ? "feito" : "" }))),
    );
  };
  atualizarProgresso();
  app.replaceChildren(
    el("header", { class: "cabecalho" },
      el("div", {}, el("h1", {}, um ? "Passageiro" : "Passageiros"), data ? el("p", { class: "quando" }, data) : null),
      progresso),
    el("div", { class: "lista" }, ...passageiros.map((p) => cardPassageiro(p, atualizarProgresso))),
  );
}

// Foto atual devolvida pelo "ler": só imagem em base64, vira data: URL (a CSP já permite data:).
function fotoAtual(foto) {
  const b64 = typeof foto?.base64 === "string" ? foto.base64 : "";
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return "";
  const tipo = /^image\/(jpeg|png|webp|gif)$/i.test(foto.mimeType || "") ? foto.mimeType.toLowerCase() : "image/jpeg";
  return `data:${tipo};base64,${b64}`;
}

// Um item por passageiro: foto (o input de arquivo cobre a foto inteira), nome, status e Telefone/E-mail.
// Campo já cadastrado aparece mascarado com "Alterar"; vazio aparece como campo para preencher.
function cardPassageiro(p, aoSalvar) {
  const id = p.id;
  const nome = String(p.primeiroNome || "Passageiro");
  const st = {
    foto: null, fotoUrl: fotoAtual(p.foto), tel: "", mail: "",
    editTel: !p.temTelefone, editMail: !p.temEmail, msg: null, salvando: false, erros: {},
    preparando: false, recem: new Set(), carregandoFoto: Boolean(p.temFoto && !p.foto), progresso: null,
  };
  const card = el("section", { class: "card", "aria-labelledby": `nome-${id}` });
  const fotoInput = el("input", { class: "foto-input", type: "file", accept: "image/*", id: `foto-${id}` });
  let botao = null;

  // Só limpa o input depois de ler o arquivo: no Android (content://) o File pode ficar ilegível se o input
  // for zerado antes. A prévia aparece na hora pelo object URL; a compressão roda em seguida, com tempo limite.
  fotoInput.addEventListener("change", async () => {
    const arq = fotoInput.files?.[0];
    if (!arq) return;
    const anterior = st.fotoUrl;
    const previa = URL.createObjectURL(arq);
    st.msg = null;
    st.preparando = true;
    st.fotoUrl = previa;
    render();
    try {
      st.foto = await comTempoLimite(comprimirFoto(arq), 20000, "A foto demorou demais para abrir. Tente outra ou tire uma nova.");
      st.fotoUrl = `data:image/jpeg;base64,${st.foto}`;
    } catch (e) {
      st.fotoUrl = anterior;
      st.msg = { tipo: "erro", texto: e?.message || "Não foi possível abrir a foto. Tente outra." };
    } finally {
      URL.revokeObjectURL(previa);
      fotoInput.value = "";
      st.preparando = false;
      render(`foto-${id}`);
    }
  });

  const pendentes = () => [
    st.foto && "foto",
    st.editTel && st.tel.trim() && "telefone",
    st.editMail && st.mail.trim() && "e-mail",
  ].filter(Boolean);

  function atualizarBotao() {
    if (!botao) return;
    const pend = pendentes();
    if (st.salvando) botao.replaceChildren(el("span", { class: "spinner pequeno", "aria-hidden": "true" }), st.progresso != null && st.progresso < 100 ? `Enviando… ${st.progresso}%` : "Salvando…");
    else botao.textContent = pend.length ? `Salvar ${listaNatural(pend)}` : "Salvar";
    botao.classList.toggle("pronto", pend.length > 0);
  }

  function campoTexto(tipo) {
    const ehTel = tipo === "tel";
    const iid = `${tipo}-${id}`;
    const msgId = `${iid}-msg`;
    const input = el("input", ehTel
      ? { type: "tel", inputmode: "tel", autocomplete: "tel", id: iid, placeholder: "(11) 98765-4321", "aria-describedby": msgId }
      : { type: "email", inputmode: "email", autocomplete: "email", id: iid, placeholder: "nome@empresa.com.br", "aria-describedby": msgId });
    input.value = ehTel ? st.tel : st.mail;
    const erroTxt = st.erros[tipo];
    if (erroTxt) input.setAttribute("aria-invalid", "true");
    const msg = el("span", { class: erroTxt ? "msg-campo erro" : "msg-campo", id: msgId }, erroTxt || "");
    input.addEventListener("input", () => {
      if (ehTel) { input.value = mascararTelefone(input.value); st.tel = input.value; } else st.mail = input.value;
      if (st.erros[tipo]) {
        delete st.erros[tipo];
        input.removeAttribute("aria-invalid");
        msg.className = "msg-campo";
        msg.textContent = "";
      }
      atualizarBotao();
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } });
    // Ao sair do campo: confirma o valor válido (borda verde) ou avisa o erro já, sem esperar o Salvar.
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      const ok = v && (ehTel ? telefoneValido(v) : emailValido(v));
      input.classList.toggle("valido", Boolean(ok));
      if (v && !ok) {
        st.erros[tipo] = ehTel ? "Confira o telefone: inclua o DDD." : "Confira o e-mail, ex.: nome@empresa.com.br.";
        input.setAttribute("aria-invalid", "true");
        msg.className = "msg-campo erro";
        msg.textContent = st.erros[tipo];
      }
    });
    return el("div", { class: "campo" }, el("label", { class: "sr-only", for: iid }, `${ehTel ? "Telefone" : "E-mail"} de ${nome}`), input, msg);
  }

  function linha({ rotulo, tem, valor, chave, tipo }) {
    const editando = chave && st[chave];
    let acao = null;
    if (chave && tem && !editando) {
      acao = el("button", {
        class: "btn-texto", type: "button", "aria-label": `Alterar ${rotulo.toLowerCase()} de ${nome}`,
        onclick: () => { st[chave] = true; st.msg = null; render(`${tipo}-${id}`); },
      }, "Alterar");
    } else if (chave && tem && editando) {
      acao = el("button", {
        class: "btn-texto", type: "button", "aria-label": `Manter ${rotulo.toLowerCase()} atual de ${nome}`,
        onclick: () => { st[chave] = false; st[tipo] = ""; delete st.erros[tipo]; render(); },
      }, "Cancelar");
    }
    return el("li", { class: `item ${tem ? "tem" : "falta"}${st.recem.has(tipo) ? " recem" : ""}` },
      el("div", { class: "item-linha" },
        el("span", { class: "item-rotulo" }, rotulo),
        editando ? null : el("span", { class: "item-valor" }, valor),
        acao),
      editando ? campoTexto(tipo) : null);
  }

  // O toque cai direto no <input type=file> transparente sobre a foto: sem <label for> nem pointer-events:none,
  // que no celular (iOS Safari) não abriam a câmera/galeria. Spinner enquanto a foto atual ou a nova carrega.
  let fotoEl = null;
  function montarFoto() {
    const ocupada = st.preparando || (st.carregandoFoto && !st.fotoUrl);
    return el("div", { class: `foto${st.fotoUrl ? " com-foto" : ""}${st.foto ? " nova" : ""}${st.preparando ? " preparando" : ocupada ? " carregando" : ""}${st.recem.has("foto") ? " recem" : ""}`, "aria-busy": ocupada ? "true" : null },
      st.fotoUrl ? el("img", { src: st.fotoUrl, alt: "" }) : ocupada ? null : el("span", { class: "foto-vazia", html: ICONE.camera }),
      el("span", { class: "foto-acao", "aria-hidden": "true", html: ICONE.camera }),
      ocupada ? el("span", { class: "foto-carregando", "aria-hidden": "true" }, el("span", { class: "spinner pequeno" })) : null,
      fotoInput);
  }
  if (st.carregandoFoto) {
    buscarFoto(id).then((f) => {
      st.carregandoFoto = false;
      if (f && !st.fotoUrl) st.fotoUrl = fotoAtual(f);
      // Troca só a foto: não redesenha o card, para não tirar o foco de quem está digitando.
      if (fotoEl?.isConnected) fotoEl.replaceWith(fotoEl = montarFoto());
      const legenda = card.querySelector(".foto-legenda");
      if (legenda && !st.foto && !st.preparando) legenda.textContent = "Toque na foto para trocar";
    });
  }

  function render(focar) {
    const s = statusDe(p);
    const temFotoAgora = Boolean(st.foto) || p.temFoto;
    const fotoBtn = fotoEl = montarFoto();
    fotoInput.setAttribute("aria-label", `${temFotoAgora ? "Trocar" : "Adicionar"} foto de ${nome}`);

    const valorTel = p.temTelefone ? (p.telefoneMascarado || "Cadastrado") : "Faltando";
    const valorMail = p.temEmail ? (p.emailMascarado || "Cadastrado") : "Faltando";
    const legendaFoto = st.preparando ? "Preparando a foto…" : st.carregandoFoto && !st.fotoUrl ? "Carregando a foto…" : st.foto ? "Foto nova, falta salvar" : temFotoAgora ? "Toque na foto para trocar" : "Toque para adicionar a foto";

    const precisaBotao = st.salvando || pendentes().length > 0 || st.editTel || st.editMail || !p.temFoto || st.msg?.tipo === "erro";
    botao = precisaBotao
      ? el("button", { class: "btn primario", type: "button", onclick: salvar, "aria-busy": st.salvando ? "true" : null, disabled: st.salvando })
      : null;
    atualizarBotao();

    card.classList.toggle("completo", completo(p));
    card.replaceChildren(...[
      el("div", { class: "card-topo" },
        fotoBtn,
        el("div", { class: "card-id" },
          el("h2", { class: "nome", id: `nome-${id}` }, nome),
          el("span", { class: `badge ${s.tipo}` }, s.texto),
          el("p", { class: `foto-legenda${st.foto ? " nova" : ""}` }, legendaFoto))),
      el("ul", { class: "checklist", "aria-label": `Dados de ${nome}` },
        linha({ rotulo: "Telefone", tem: p.temTelefone, valor: valorTel, chave: "editTel", tipo: "tel" }),
        linha({ rotulo: "E-mail", tem: p.temEmail, valor: valorMail, chave: "editMail", tipo: "mail" })),
      botao,
      montarAviso(),
    ].filter(Boolean));
    if (focar) card.querySelector(`#${CSS.escape(focar)}`)?.focus();
  }

  function montarAviso() {
    return el("p", { class: `aviso ${st.msg?.tipo || ""}`, role: st.msg?.tipo === "erro" ? "alert" : "status", tabindex: "-1", id: `msg-${id}`, hidden: !st.msg },
      st.msg ? el("span", { class: "aviso-icone", html: st.msg.tipo === "ok" ? ICONE.ok : ICONE.falta }) : null,
      st.msg?.texto || "");
  }
  // Troca só o aviso, sem redesenhar o card (quem digita não perde o foco).
  function avisar(msg) {
    st.msg = msg;
    card.querySelector(".aviso")?.replaceWith(montarAviso());
  }

  async function salvar() {
    if (st.salvando) return;
    const corpo = { passageiroId: id };
    st.erros = {};
    if (st.editTel && st.tel.trim()) {
      if (telefoneValido(st.tel)) corpo.telefone = telefoneParaEnvio(st.tel);
      else st.erros.tel = "Confira o telefone: inclua o DDD, ex.: (11) 98765-4321.";
    }
    if (st.editMail && st.mail.trim()) {
      if (emailValido(st.mail)) corpo.email = st.mail.trim();
      else st.erros.mail = "Confira o e-mail, ex.: nome@empresa.com.br.";
    }
    if (st.foto) corpo.fotoBase64 = st.foto;
    if (st.erros.tel || st.erros.mail) {
      st.msg = { tipo: "erro", texto: "Corrija o campo destacado e salve de novo." };
      return render(st.erros.tel ? `tel-${id}` : `mail-${id}`);
    }
    if (Object.keys(corpo).length === 1) {
      // Nada preenchido: aponta o primeiro campo vazio (erro ao lado e foco nele) em vez de um aviso genérico.
      const campo = st.editTel ? "tel" : st.editMail ? "mail" : null;
      if (campo) {
        st.erros[campo] = campo === "tel" ? "Informe o telefone com DDD." : "Informe o e-mail.";
        st.msg = null;
        return render(`${campo}-${id}`);
      }
      st.msg = { tipo: "atencao", texto: "Toque na foto para adicionar." };
      return render(`foto-${id}`);
    }
    const itens = pendentes();
    st.salvando = true;
    st.msg = null;
    render();
    // Rede caiu no meio do envio: tenta de novo sozinha (até 3 vezes) antes de avisar. Entre as tentativas espera
    // 2 s/4 s ou, com o aparelho sabidamente offline, até 30 s pelo evento `online` (senão as 3 tentativas falhariam
    // na hora, sem dar tempo de a rede voltar). Repetir é seguro porque "salvar" com os mesmos valores é idempotente
    // (sobrescreve foto/telefone/e-mail). Tempo esgotado (servidor lento) não repete, para não segurar a pessoa por minutos.
    const corpoJson = JSON.stringify({ token, ...corpo });
    let resp;
    for (let tentativa = 1; ; tentativa++) {
      try {
        resp = await enviar("/api/salvar", corpoJson, (pct) => { if (pct !== st.progresso) { st.progresso = pct; atualizarBotao(); } });
        break;
      } catch (e) {
        if (tentativa >= 3 || e.message !== "rede") { resp = { status: e.message }; break; }
        st.progresso = null;
        atualizarBotao();
        avisar({ tipo: "info", texto: `Não foi possível enviar. Tentando de novo (${tentativa + 1} de 3)…` });
        await esperarRede(navigator.onLine === false ? 30000 : tentativa * 2000);
      }
    }
    st.salvando = false;
    st.progresso = null;
    if (resp.status === 200) {
      st.recem = new Set([corpo.fotoBase64 && "foto", corpo.telefone && "tel", corpo.email && "mail"].filter(Boolean));
      if (corpo.fotoBase64) { p.temFoto = true; st.foto = null; }
      if (corpo.telefone) { p.temTelefone = true; p.telefoneMascarado = telefoneOculto(corpo.telefone); st.tel = ""; st.editTel = false; }
      if (corpo.email) { p.temEmail = true; p.emailMascarado = emailOculto(corpo.email); st.mail = ""; st.editMail = false; }
      const plural = itens.length > 1 ? "salvos" : itens[0] === "foto" ? "salva" : "salvo";
      st.msg = { tipo: "ok", texto: `${maiuscula(listaNatural(itens))} ${plural}.` };
      render(`msg-${id}`);
      aoSalvar();
      return;
    }
    const erros = {
      410: "Este link expirou e nada foi salvo. Peça um novo à equipe Betinhos.",
      404: "Este link não vale mais e nada foi salvo. Peça um novo à equipe Betinhos.",
      429: "Muitas tentativas seguidas. Aguarde alguns minutos e toque em Salvar de novo.",
      400: "Algum dado não foi aceito. Confira o telefone e o e-mail e tente de novo.",
      413: "A foto ficou grande demais. Escolha outra.",
      rede: "Não conseguimos enviar. Confira a internet; o que você preencheu continua aqui, toque em Salvar para tentar de novo.",
      // Prazo de inatividade (não é falta de internet): o servidor pode até ter salvo; salvar de novo é seguro.
      tempo: "O envio demorou demais. O que você preencheu continua aqui; toque em Salvar para tentar de novo.",
    };
    st.msg = { tipo: "erro", texto: erros[resp.status] || "Não foi possível salvar agora. O que você preencheu continua aqui; toque em Salvar para tentar de novo." };
    render(`msg-${id}`);
  }

  // O destaque de "acabou de salvar" vale só para a renderização seguinte ao sucesso.
  card.addEventListener("animationend", (e) => { if (e.animationName === "destaque") st.recem.clear(); });
  render();
  return card;
}

async function decodificar(arq) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(arq, { imageOrientation: "from-image" }); } catch { /* tenta via <img> */ }
  }
  const url = URL.createObjectURL(arq);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const comTempoLimite = (promessa, ms, texto) =>
  Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error(texto)), ms))]);

// toBlob é assíncrono (não trava a tela como toDataURL) e o base64 sai do FileReader.
function jpegBase64(canvas, q) {
  return new Promise((ok, falha) => canvas.toBlob((blob) => {
    if (!blob) return falha(new Error("Não foi possível preparar a foto. Tente outra."));
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => falha(r.error);
    r.readAsDataURL(blob);
  }, "image/jpeg", q));
}

// Redimensiona para lado maior ≤ 1280 px, JPEG 0,8 e reduz a qualidade até caber em 3 MB. Retorna base64 sem prefixo.
async function comprimirFoto(arq) {
  let fonte;
  try { fonte = await decodificar(arq); } catch {
    const heic = /hei[cf]/i.test(arq.type) || /\.hei[cf]$/i.test(arq.name);
    throw new Error(heic
      ? "Este aparelho não abriu a foto em HEIC. Escolha outra foto ou tire uma nova pela câmera."
      : "Não foi possível abrir este arquivo. Escolha uma foto em JPG ou PNG.");
  }
  const w = fonte.width, h = fonte.height;
  const escala = Math.min(1, LADO_MAX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  fonte.close?.();
  for (let q = 0.8; q >= 0.3; q -= 0.1) {
    const b64 = await jpegBase64(canvas, q);
    if (b64.length * 0.75 <= BYTES_MAX) return b64;
  }
  throw new Error("A foto ficou grande demais. Tente outra.");
}

addEventListener("hashchange", carregar);
carregar();
