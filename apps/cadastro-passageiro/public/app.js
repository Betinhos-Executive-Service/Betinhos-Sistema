// Página do link de cadastro. Vanilla JS; o token vem do fragmento #t= e só vai ao /api no corpo.
import { emailValido, mascararTelefone, telefoneParaEnvio, telefoneValido } from "./validacao.mjs";

const app = document.getElementById("app");
const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
const LADO_MAX = 1600;
const BYTES_MAX = 3 * 1024 * 1024;

const ICONE_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos) if (f != null) n.append(f);
  return n;
}

function estado(titulo, texto, extra) {
  app.replaceChildren(el("section", { class: "estado" }, el("h1", {}, titulo), el("p", {}, texto), extra));
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
    estado("Link indisponível", "Este link expirou ou não é mais válido. Peça um novo à Betinhos.");
  } else if (status === 429) {
    estado("Muitas tentativas", "Muitas tentativas, aguarde alguns minutos e tente de novo.");
  } else {
    estado("Não foi possível carregar", "Verifique sua conexão e tente de novo.",
      el("button", { class: "btn primario", type: "button", onclick: tentar }, "Tentar de novo"));
  }
}

async function carregar() {
  app.replaceChildren(el("section", { class: "estado" }, el("div", { class: "spinner", "aria-hidden": "true" }), el("p", {}, "Carregando…")));
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return mostrarErroGeral(410);
  let resp;
  try { resp = await chamar("/api/ler", {}); } catch { return mostrarErroGeral(0, carregar); }
  if (resp.status !== 200 || !Array.isArray(resp.dados?.passageiros)) return mostrarErroGeral(resp.status, carregar);
  renderLista(resp.dados);
}

function formatarData(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

function renderLista({ passageiros, dataServico }) {
  if (!passageiros.length) return estado("Nada para preencher", "Este link não tem passageiros no momento. Fale com a Betinhos.");
  const data = formatarData(dataServico);
  const um = passageiros.length === 1;
  app.replaceChildren(
    el("h1", {}, um ? "Cadastro do passageiro" : "Cadastro dos passageiros"),
    el("p", { class: "intro" },
      `Com a foto, o motorista reconhece ${um ? "o passageiro" : "cada passageiro"} na chegada${data ? ` em ${data}` : ""}.`),
    ...passageiros.map(cardPassageiro),
  );
}

function cardPassageiro(p) {
  const id = p.id;
  const nome = String(p.primeiroNome || "Passageiro");
  const st = { foto: null };

  // A foto é o próprio botão: área grande para tocar, com a prévia no lugar.
  const textoFoto = () => (st.foto || p.temFoto ? "Trocar foto" : "Adicionar foto");
  const avatar = el("span", { class: "foto-area", "aria-hidden": "true", html: ICONE_CAMERA });
  const fotoInput = el("input", { class: "foto-input", type: "file", accept: "image/*", id: `foto-${id}` });
  const fotoLegenda = el("span", { class: "foto-legenda" }, textoFoto());
  const fotoBtn = el("label", { class: "foto", for: `foto-${id}` }, avatar, fotoLegenda);
  if (p.temFoto) avatar.append(el("span", { class: "foto-tem" }, "Foto já enviada"));
  const fotoMsg = el("p", { class: "aviso erro", hidden: true, role: "alert" });

  const tel = el("input", { type: "tel", inputmode: "tel", autocomplete: "tel", id: `tel-${id}`, placeholder: "(11) 98765-4321 ou +1 …" });
  const telMsg = el("span", { class: "msg-campo", id: `tel-msg-${id}` });
  const mail = el("input", { type: "email", inputmode: "email", autocomplete: "email", id: `mail-${id}`, placeholder: "nome@empresa.com.br" });
  const mailMsg = el("span", { class: "msg-campo", id: `mail-msg-${id}` });
  tel.setAttribute("aria-describedby", telMsg.id);
  mail.setAttribute("aria-describedby", mailMsg.id);

  const salvar = el("button", { class: "btn primario", type: "button" }, "Salvar");
  const status = el("p", { class: "aviso", hidden: true, role: "status" });

  function aviso(n, tipo, texto) {
    n.className = `aviso ${tipo}`;
    n.textContent = texto;
    n.hidden = !texto;
  }

  tel.addEventListener("input", () => {
    tel.value = mascararTelefone(tel.value);
    tel.removeAttribute("aria-invalid");
    telMsg.textContent = "";
  });
  mail.addEventListener("input", () => { mail.removeAttribute("aria-invalid"); mailMsg.textContent = ""; });

  fotoInput.addEventListener("change", async () => {
    const arq = fotoInput.files?.[0];
    fotoInput.value = "";
    if (!arq) return;
    aviso(fotoMsg, "erro", "");
    fotoLegenda.textContent = "Preparando foto…";
    try {
      st.foto = await comprimirFoto(arq);
      avatar.replaceChildren(el("img", { src: `data:image/jpeg;base64,${st.foto}`, alt: "" }));
      fotoLegenda.textContent = textoFoto();
    } catch (e) {
      st.foto = null;
      fotoLegenda.textContent = textoFoto();
      aviso(fotoMsg, "erro", e.message || "Não foi possível abrir a foto. Tente outra.");
    }
  });

  salvar.addEventListener("click", async () => {
    const corpo = { passageiroId: id };
    let ok = true;
    if (tel.value.trim()) {
      if (telefoneValido(tel.value)) corpo.telefone = telefoneParaEnvio(tel.value);
      else { ok = false; tel.setAttribute("aria-invalid", "true"); telMsg.textContent = "Telefone com DDD, ex.: (11) 98765-4321 ou +1 555 123 4567."; }
    }
    if (mail.value.trim()) {
      if (emailValido(mail.value)) corpo.email = mail.value.trim();
      else { ok = false; mail.setAttribute("aria-invalid", "true"); mailMsg.textContent = "Confira o e-mail, ex.: nome@empresa.com.br."; }
    }
    if (st.foto) corpo.fotoBase64 = st.foto;
    if (!ok) return aviso(status, "erro", "");
    if (Object.keys(corpo).length === 1) return aviso(status, "atencao", "Preencha a foto, o telefone ou o e-mail antes de salvar.");

    salvar.disabled = true;
    salvar.textContent = "Salvando…";
    aviso(status, "ok", "");
    let resp;
    try { resp = await chamar("/api/salvar", corpo); } catch { resp = { status: 0 }; }
    salvar.disabled = false;
    if (resp.status === 200) {
      salvar.textContent = "Salvo";
      aviso(status, "ok", "Dados salvos. Obrigado!");
      if (corpo.fotoBase64) { p.temFoto = true; st.foto = null; fotoLegenda.textContent = textoFoto(); }
      setTimeout(() => { salvar.textContent = "Salvar"; }, 2500);
      return;
    }
    salvar.textContent = "Tentar de novo";
    if (resp.status === 410 || resp.status === 404) aviso(status, "erro", "Este link expirou ou não é mais válido. Peça um novo à Betinhos.");
    else if (resp.status === 429) aviso(status, "erro", "Muitas tentativas, aguarde alguns minutos.");
    else if (resp.status === 400) aviso(status, "erro", "Algum dado não foi aceito. Confira e tente de novo.");
    else if (resp.status === 413) aviso(status, "erro", "A foto ficou grande demais. Tente outra.");
    else aviso(status, "erro", "Não foi possível salvar agora. Toque em Tentar de novo.");
  });

  return el("section", { class: "card", "aria-label": `Passageiro ${nome}` },
    el("p", { class: "nome" }, nome), fotoInput, fotoBtn, fotoMsg,
    el("label", { class: "campo", for: tel.id }, "Telefone", tel, telMsg),
    el("label", { class: "campo", for: mail.id }, "E-mail", mail, mailMsg),
    salvar, status,
  );
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
