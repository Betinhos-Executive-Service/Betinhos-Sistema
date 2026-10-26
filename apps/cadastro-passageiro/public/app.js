// Página do link de cadastro. Vanilla JS; o token vem do fragmento #t= e só vai ao /api no corpo.
import { emailOculto, emailValido, mascararTelefone, telefoneOculto, telefoneParaEnvio, telefoneValido } from "./validacao.mjs";

const app = document.getElementById("app");
const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
const LADO_MAX = 1600;
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

async function chamar(caminho, corpo) {
  const r = await fetch(caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...corpo }),
  });
  let dados = null;
  try { dados = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, dados };
}

function mostrarErroGeral(status, tentar) {
  if (status === 404 || status === 410 || status === 400) {
    estado("link", "Este link não vale mais",
      "Por segurança, o link de cadastro expira em 36 horas ou quando um novo é gerado. Peça um novo à equipe Betinhos pelo mesmo canal em que recebeu este.");
  } else if (status === 429) {
    estado("relogio", "Muitas tentativas seguidas", "Aguarde alguns minutos e abra o link de novo.");
  } else {
    estado("falta", "Não conseguimos carregar", "Confira sua conexão e tente de novo.",
      el("button", { class: "btn primario", type: "button", onclick: tentar }, "Tentar de novo"));
  }
}

async function carregar() {
  app.replaceChildren(esqueleto());
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return mostrarErroGeral(410);
  let resp;
  try { resp = await chamar("/api/ler", {}); } catch { return mostrarErroGeral(0, carregar); }
  if (resp.status !== 200 || !Array.isArray(resp.dados?.passageiros)) return mostrarErroGeral(resp.status, carregar);
  renderLista(resp.dados);
}

// Esqueleto com a forma da lista (cabeçalho + 3 cards) enquanto o "ler" responde.
function esqueleto() {
  const bloco = (cls) => el("span", { class: `sk ${cls}` });
  const card = () => el("div", { class: "card sk-card" },
    el("div", { class: "card-topo" }, bloco("sk-foto"), el("div", { class: "card-id" }, bloco("sk-nome"), bloco("sk-badge"))),
    el("div", { class: "sk-dados" }, bloco("sk-linha"), bloco("sk-linha")));
  return el("div", { class: "esqueleto", role: "status", "aria-label": "Carregando os passageiros" },
    el("div", { class: "cabecalho" }, el("div", { class: "card-id" }, bloco("sk-titulo"), bloco("sk-data"))),
    el("div", { class: "lista" }, card(), card(), card()));
}

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
    preparando: false, recem: new Set(),
  };
  const card = el("section", { class: "card", "aria-labelledby": `nome-${id}` });
  const fotoInput = el("input", { class: "foto-input", type: "file", accept: "image/*", id: `foto-${id}` });
  let botao = null;

  fotoInput.addEventListener("change", async () => {
    const arq = fotoInput.files?.[0];
    fotoInput.value = "";
    if (!arq) return;
    st.msg = null;
    st.preparando = true;
    render();
    try {
      st.foto = await comprimirFoto(arq);
      st.fotoUrl = `data:image/jpeg;base64,${st.foto}`;
    } catch (e) {
      st.foto = null;
      st.msg = { tipo: "erro", texto: e.message || "Não foi possível abrir a foto. Tente outra." };
    }
    st.preparando = false;
    render(`foto-${id}`);
  });

  const pendentes = () => [
    st.foto && "foto",
    st.editTel && st.tel.trim() && "telefone",
    st.editMail && st.mail.trim() && "e-mail",
  ].filter(Boolean);

  function atualizarBotao() {
    if (!botao) return;
    const pend = pendentes();
    if (st.salvando) botao.replaceChildren(el("span", { class: "spinner pequeno", "aria-hidden": "true" }), "Salvando…");
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
    return el("label", { class: "campo", for: iid }, el("span", { class: "sr-only" }, `${ehTel ? "Telefone" : "E-mail"} de ${nome}`), input, msg);
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

  function render(focar) {
    const s = statusDe(p);
    const temFotoAgora = Boolean(st.foto) || p.temFoto;
    // O toque cai direto no <input type=file> transparente sobre a foto: sem <label for> nem pointer-events:none,
    // que no celular (iOS Safari) não abriam a câmera/galeria.
    const fotoBtn = el("div", { class: `foto${st.fotoUrl ? " com-foto" : ""}${st.foto ? " nova" : ""}${st.preparando ? " preparando" : ""}${st.recem.has("foto") ? " recem" : ""}`, "aria-busy": st.preparando ? "true" : null },
      st.fotoUrl ? el("img", { src: st.fotoUrl, alt: "" }) : el("span", { class: "foto-vazia", html: ICONE.camera }),
      el("span", { class: "foto-acao", "aria-hidden": "true", html: ICONE.camera }),
      st.preparando ? el("span", { class: "foto-carregando", "aria-hidden": "true" }, el("span", { class: "spinner pequeno" })) : null,
      fotoInput);
    fotoInput.setAttribute("aria-label", `${temFotoAgora ? "Trocar" : "Adicionar"} foto de ${nome}`);

    const valorTel = p.temTelefone ? (p.telefoneMascarado || "Cadastrado") : "Faltando";
    const valorMail = p.temEmail ? (p.emailMascarado || "Cadastrado") : "Faltando";
    const legendaFoto = st.preparando ? "Preparando a foto…" : st.foto ? "Foto nova, falta salvar" : temFotoAgora ? "Toque na foto para trocar" : "Toque para adicionar a foto";

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
      el("p", { class: `aviso ${st.msg?.tipo || ""}`, role: st.msg?.tipo === "erro" ? "alert" : "status", tabindex: "-1", id: `msg-${id}`, hidden: !st.msg },
        st.msg ? el("span", { class: "aviso-icone", html: st.msg.tipo === "ok" ? ICONE.ok : ICONE.falta }) : null,
        st.msg?.texto || ""),
    ].filter(Boolean));
    if (focar) card.querySelector(`#${CSS.escape(focar)}`)?.focus();
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
      st.msg = { tipo: "atencao", texto: "Nada novo para salvar." };
      return render(`msg-${id}`);
    }
    const itens = pendentes();
    st.salvando = true;
    st.msg = null;
    render();
    let resp;
    try { resp = await chamar("/api/salvar", corpo); } catch { resp = { status: 0 }; }
    st.salvando = false;
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

// Redimensiona para lado maior ≤ 1600 px, JPEG 0,8 e reduz a qualidade até caber em 3 MB. Retorna base64 sem prefixo.
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
    const b64 = canvas.toDataURL("image/jpeg", q).split(",")[1];
    if (b64.length * 0.75 <= BYTES_MAX) return b64;
  }
  throw new Error("A foto ficou grande demais. Tente outra.");
}

addEventListener("hashchange", carregar);
carregar();
