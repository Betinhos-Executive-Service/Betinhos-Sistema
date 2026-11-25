// Durable Object `Viagem`: um por link (`env.VIAGEM.idFromName(id)`). Faz uma leitura da Infleet por viagem
// (não uma por aba/isolate), guarda trilha, rota e percorrido no próprio storage e espelha no KV só os marcos
// (chegou, saiu, concluiu, chegando), para o conector e o Dataverse. O Worker fala com ele por `stub.fetch`
// (host `https://viagem`); sem `extends DurableObject` porque `cloudflare:workers` não carrega nos testes (Node).
import { jaAvaliado } from "./avaliacao.mjs";
import { EVENTOS, eventosNovos, guardarInscricao, MOTORISTA_DEFINIDO, payloadAviso, validarInscricao } from "./avisos.mjs";
import { calcularDados, gravarNoKv, marcosChave, publicarDados } from "./dados.mjs";
import { mesclarEtapas } from "./etapas.mjs";
import { distanciaMetros } from "./infleet.mjs";
import { proximoAlarme, LENTO_MS, LIMPEZA_MS } from "./ritmo.mjs";
import { VERSAO } from "./version.mjs";
import { sendPush, vapidDoEnv } from "./webpush.mjs";

const LEITURA_FRESCA_MS = 10000;     // leitura reaproveitada por requisições e conexões novas
const LEITURA_RESERVA_MS = 15 * 60000; // Infleet fora: a última leitura segue valendo, marcada
const RECARREGAR_MS = 5 * 60000;     // relê o link no KV (edições feitas fora deste Worker)
const MAX_FALHAS_AVISO = 3;          // tentativas de um evento (uma por alarm) antes de desistir
// Progresso que o Viagem conhece melhor que o KV (ele é quem grava); o resto do link vem do KV.
const PROGRESSO = ["ultimaPos", "trajetoLidoEm", "trajetoTentadoEm", "trajetoTentativas", "saidaVistaEm", "destino", "destinoTentadoEm"];

export function mesclarComKv(kv, t) {
  const r = { ...kv };
  for (const k of PROGRESSO) if (t[k] !== undefined) r[k] = t[k];
  if (kv.estado || t.estado) r.estado = { ...(kv.estado ?? {}), ...(t.estado ?? {}) };
  if (Array.isArray(kv.etapas) && Array.isArray(t.etapas)) r.etapas = mesclarEtapas(kv.etapas, t.etapas);
  return r;
}

const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

export class Viagem {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.s = undefined;  // estado persistido (chave `s`); null = DO vazio
    this.salvo = null;   // JSON do último `s` gravado
    this.p = undefined;  // cache do percorrido (chave `p`)
    this.leitura = null; // { em, dados }: só em memória
    this.lendo = null;   // leitura em andamento (requisições simultâneas esperam a mesma)
    this.rotaEm = null;  // última chamada ao roteador
  }

  async carregar() {
    if (this.s !== undefined) return this.s;
    const [s, p] = await Promise.all([this.ctx.storage.get("s"), this.ctx.storage.get("p")]);
    this.s = s ?? null;
    this.salvo = s ? JSON.stringify(s) : null;
    this.p = p ?? null;
    return this.s;
  }

  // Grava `s` só quando muda (cada gravação é uma linha na cota diária do plano gratuito).
  async salvar() {
    const j = JSON.stringify(this.s);
    if (j === this.salvo) return;
    await this.ctx.storage.put("s", this.s);
    this.salvo = j;
  }

  async iniciar(id, raw) {
    const t = JSON.parse(raw);
    const concluidoKv = Boolean(await this.env.TRACK_KV.get(`concluido:${id}`));
    this.s = { id, t, est: {}, kvChave: marcosChave(t), recarregadoEm: Date.now(), concluidoKv, inscricoes: [], enviados: {}, falhas: {}, encerrado: false, limparEm: null, fase: null };
    await this.salvar();
  }

  get conectados() {
    return this.ctx.getWebSockets?.().length ?? 0;
  }

  async ler({ economia = false } = {}) {
    // Leitura em economia (sem rota longe do alvo) não serve a quem está olhando.
    const l = this.leitura;
    if (l && Date.now() - l.em < LEITURA_FRESCA_MS && (economia || !l.economia)) return l.dados;
    this.lendo ??= this.lerAgora(economia).finally(() => { this.lendo = null; });
    return this.lendo;
  }

  async lerAgora(economia) {
    await this.recarregarSePreciso();
    const s = this.s;
    if (!s?.t || s.encerrado) return null;
    if (Date.parse(s.t.expiraEm) < Date.now()) { await this.encerrar(); return null; }
    const base = s.t;
    const t = structuredClone(base);
    const est = { trilha: s.est.trilha, estadoRota: s.est.estadoRota, rotaEm: this.rotaEm, percorrido: this.p };
    let dados;
    try {
      // `gravar` não faz nada: `t` já carrega tudo e o espelho no KV é decidido abaixo, pela chave dos marcos.
      dados = await calcularDados(s.id, t, this.env, est, { concluido: s.concluidoKv, economia, gravar: async () => {} });
    } catch (e) {
      if (!this.leitura || Date.now() - this.leitura.em > LEITURA_RESERVA_MS) throw e;
      console.warn(`Infleet indisponível, servindo última leitura: ${e?.message}`);
      return { ...this.leitura.dados, fonteIndisponivel: true };
    }
    // Encerrado ou recarregado pela API durante a leitura: `t` é do link antigo; gravá-lo desfaria a edição
    // (ou recriaria no KV um link revogado).
    const mudou = () => this.s !== s || s.t !== base;
    if (mudou()) return this.s?.encerrado ? null : dados;
    if (marcosChave(t) !== s.kvChave) {
      const gravou = await gravarNoKv(this.env, s.id, t, { mesclar: true });
      if (mudou()) return this.s?.encerrado ? null : dados;
      if (gravou !== false) s.kvChave = marcosChave(t);
    }
    s.t = t;
    s.est = { trilha: est.trilha ?? null, estadoRota: est.estadoRota ?? null };
    this.rotaEm = est.rotaEm; // só em memória: muda a cada tentativa de rota e serve apenas ao modo economia
    s.fase = dados.fase;
    if (est.percorrido && est.percorrido !== this.p) { this.p = est.percorrido; await this.ctx.storage.put("p", this.p); }
    await this.salvar();
    this.leitura = { em: Date.now(), dados, economia };
    return dados;
  }

  // A cada 5 min relê o link e a conclusão no KV. Sem a chave, só encerra se expirou ou foi revogado
  // (falta transitória do KV não derruba um link ativo).
  async recarregarSePreciso() {
    const s = this.s;
    if (!s?.t || s.encerrado || Date.now() - (s.recarregadoEm ?? 0) < RECARREGAR_MS) return;
    s.recarregadoEm = Date.now();
    try {
      const [raw, concluido] = await Promise.all([this.env.TRACK_KV.get(`track:${s.id}`), this.env.TRACK_KV.get(`concluido:${s.id}`)]);
      if (!raw) {
        if (Date.parse(s.t.expiraEm) < Date.now() || await this.env.TRACK_KV.get(`revogado:${s.id}`)) await this.encerrar();
        return;
      }
      const kv = JSON.parse(raw);
      // Editado pela API desde a última recarga (aviso ao Viagem perdido): o KV vale inteiro, como em `recarregar`.
      const editado = kv.atualizadoEm && !(Date.parse(kv.atualizadoEm) <= Date.parse(s.t.atualizadoEm));
      s.t = editado ? { ...kv, ultimaPos: s.t.ultimaPos } : mesclarComKv(kv, s.t);
      s.kvChave = marcosChave(kv);
      s.concluidoKv = Boolean(concluido);
    } catch (e) { console.warn(`Recarga do link falhou: ${e?.message}`); }
  }

  // Link editado ou concluído pela API: o KV relido no mesmo isolate vale, só a última posição é do Viagem.
  async recarregar(id, raw) {
    if (!this.s?.t) return this.iniciar(id, raw);
    const kv = JSON.parse(raw);
    Object.assign(this.s, { t: { ...kv, ultimaPos: this.s.t.ultimaPos }, kvChave: marcosChave(kv), recarregadoEm: Date.now(), encerrado: false });
    if (kv.concluidoPor) this.s.concluidoKv = true;
    this.leitura = null;
    await this.salvar();
    await this.agendar(null, { agora: true });
  }

  // Revogado ou expirado: apaga tudo e deixa só a marca de encerrado, removida em 24 h.
  async encerrar() {
    const id = this.s?.id ?? null;
    for (const ws of this.ctx.getWebSockets?.() ?? []) {
      try { ws.send(JSON.stringify({ tipo: "fim" })); ws.close(1000, "fim"); } catch { /* já fechado */ }
    }
    await this.ctx.storage.deleteAll();
    this.s = { id, encerrado: true, limparEm: Date.now() + LIMPEZA_MS };
    this.salvo = null;
    this.p = null;
    this.leitura = null;
    await this.salvar();
    await this.ctx.storage.setAlarm(this.s.limparEm);
  }

  distanciaAlvo(dados) {
    const alvo = dados?.etapas?.find((e) => e.atual);
    const p = dados?.posicao;
    return alvo && p ? distanciaMetros(p.lat, p.lon, alvo.lat, alvo.lon) : null;
  }

  // Marca o próximo alarm pelo ritmo. Fora do handler do alarm só antecipa (nunca adia um alarm já marcado).
  // `retentar`: a leitura falhou; sem saber onde o carro está, não espera a janela do horário (no máximo 60 s).
  async agendar(dados, { noAlarme = false, agora = false, retentar = false } = {}) {
    const s = this.s;
    if (!s) return;
    const agoraMs = Date.now();
    let { emMs, limpar } = proximoAlarme({
      agoraMs, conectados: this.conectados, inscricoes: s.inscricoes?.length ?? 0, fase: dados?.fase ?? s.fase,
      distanciaAlvoM: this.distanciaAlvo(dados), horarioAgendado: s.t?.horarioAgendado, encerrado: s.encerrado,
    });
    if (limpar) { s.limparEm ??= emMs; emMs = s.limparEm; await this.salvar(); }
    if (agora && !limpar && emMs !== null) emMs = agoraMs;
    if (retentar && !limpar && (s.inscricoes?.length ?? 0) > 0) emMs = Math.min(emMs ?? Infinity, agoraMs + LENTO_MS);
    if (emMs === null) return;
    const atual = noAlarme ? null : await this.ctx.storage.getAlarm();
    if (atual === null || atual === undefined || emMs < atual) await this.ctx.storage.setAlarm(emMs);
  }

  async alarm() {
    await this.carregar();
    const s = this.s;
    if (!s) return;
    if (s.limparEm && Date.now() >= s.limparEm) {
      for (const ws of this.ctx.getWebSockets?.() ?? []) { try { ws.close(1000, "fim"); } catch { /* já fechado */ } }
      await this.ctx.storage.deleteAll();
      this.s = null; this.salvo = null; this.p = null; this.leitura = null;
      return;
    }
    if (s.encerrado) return;
    let dados = null, falhou = false;
    try { dados = await this.ler({ economia: this.conectados === 0 }); } catch (e) { falhou = true; console.warn(`Leitura do alarm falhou: ${e?.message}`); }
    if (this.s?.encerrado) return;
    // Sem leitura de reserva (a memória some quando o DO hiberna), a página ainda fica sabendo que o rastreador não responde.
    if (falhou) for (const ws of this.ctx.getWebSockets?.() ?? []) { try { ws.send('{"tipo":"fonte_fora"}'); } catch { /* fechada no meio */ } }
    await this.transmitir(dados);
    try { await this.avisar(dados); } catch (e) { console.warn(`Avisos falharam: ${e?.message}`); }
    await this.agendar(dados, { noAlarme: true, retentar: falhou || Boolean(dados?.fonteIndisponivel) });
  }

  // Manda a leitura pública às conexões (por padrão, todas). O diagnóstico vai só às abertas com ?debug=1.
  async transmitir(dados, sockets = this.ctx.getWebSockets?.() ?? []) {
    if (!dados || !sockets.length) return;
    const avaliado = dados.fase === "concluido" && await jaAvaliado(this.env, this.s.id);
    const msg = {};
    for (const ws of sockets) {
      const debug = this.ctx.getTags?.(ws)?.includes("debug") ?? false;
      msg[debug] ??= JSON.stringify({ tipo: "dados", ...publicarDados(dados, { debug, avaliado, versao: VERSAO }) });
      try { ws.send(msg[debug]); } catch { /* fechada no meio */ }
    }
  }

  // Aceita a conexão com hibernação (DO dorme com sockets abertos sem cobrar duração). Leitura fresca vai na
  // hora; senão o alarm é antecipado para agora e transmite assim que a Infleet responder.
  async aceitarConexao(servidor, debug) {
    this.ctx.acceptWebSocket(servidor, debug ? ["debug"] : []);
    if (this.leitura && Date.now() - this.leitura.em < LEITURA_FRESCA_MS) await this.transmitir(this.leitura.dados, [servidor]);
    else await this.ctx.storage.setAlarm(Date.now());
  }

  // DO ainda vazio (conexão ou inscrição antes de qualquer /dados): inicia pelo link do KV.
  async garantirIniciado(id) {
    if (this.s?.t) return true;
    const raw = this.s?.encerrado ? null : await this.env.TRACK_KV.get(`track:${id}`);
    if (!raw) return false;
    await this.iniciar(id, raw);
    return true;
  }

  async aoVivo(id, debug) {
    if (!(await this.garantirIniciado(id))) return json({ expirado: true }, 404);
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    await this.aceitarConexao(servidor, debug);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // Primeira inscrição: eventos que já aconteceram viram vistos (ninguém recebe aviso atrasado). Só uma leitura
  // de agora serve de base: se ela falhar (ou vier a de reserva), nada é marcado sem ter sido enviado e o alarm
  // tenta de novo em até 60 s, para o "chegando" não esperar a janela do horário.
  async inscrever(id, corpo) {
    const { inscricao, erro } = validarInscricao(corpo);
    if (erro) return json({ erro }, 400);
    if (!(await this.garantirIniciado(id))) return json({ expirado: true }, 404);
    const s = this.s;
    let falhou = false;
    if (!s.inscricoes.length) {
      let dados = null;
      try { dados = await this.ler(); } catch (e) { console.warn(`Leitura da inscrição falhou: ${e?.message}`); }
      if (this.s.encerrado) return json({ expirado: true }, 404);
      falhou = !dados || Boolean(dados.fonteIndisponivel);
      if (!falhou) {
        for (const e of eventosNovos(dados, s.enviados)) s.enviados[e] = true;
        s.motorista = dados.motorista?.nome ?? null;
      }
    }
    s.inscricoes = guardarInscricao(s.inscricoes, inscricao);
    await this.salvar();
    await this.agendar(this.leitura?.dados ?? null, { retentar: falhou });
    return json({ ok: true }, 201);
  }

  async desinscrever(corpo) {
    if (this.s?.inscricoes?.length) {
      this.s.inscricoes = this.s.inscricoes.filter((i) => i.endpoint !== corpo?.endpoint);
      await this.salvar();
    }
    return new Response(null, { status: 204 });
  }

  // Um aviso de fase por leitura: o evento novo mais adiantado; os anteriores ficam marcados. Antes dele, o do
  // motorista (definido ou trocado antes da viagem começar). Sem nenhuma entrega, tenta no alarm seguinte, até 3 vezes.
  async avisar(dados) {
    const s = this.s, vapid = vapidDoEnv(this.env);
    if (!dados || !vapid || !s?.inscricoes?.length) return;
    const nome = dados.motorista?.nome ?? null; // em definição não há nome
    const saiu = s.enviados.viagem_iniciada || eventosNovos(dados).some((e) => e === "viagem_iniciada" || e === "concluido");
    // undefined = Viagem de antes deste aviso: o motorista de agora vira a base, sem aviso.
    if (s.motorista === undefined || !nome || saiu) s.motorista = nome;
    else if (nome !== s.motorista && await this.enviar(MOTORISTA_DEFINIDO, dados, vapid)) s.motorista = nome;
    const evento = eventosNovos(dados, s.enviados).at(-1);
    if (evento && await this.enviar(evento, dados, vapid)) for (const e of EVENTOS.slice(0, EVENTOS.indexOf(evento) + 1)) s.enviados[e] = true;
    await this.salvar();
  }

  // Manda o evento a todas as inscrições; a que o serviço de push deu como encerrada (404/410) sai.
  // true = resolvido (entregue, sem inscrições ou 3 falhas): quem chamou marca como enviado.
  async enviar(evento, dados, vapid) {
    const s = this.s;
    const resultados = await Promise.all(s.inscricoes.map((i) =>
      sendPush(i, payloadAviso(s.id, evento, dados, i.idioma), vapid).catch(() => ({ endpoint: i.endpoint, status: 0, gone: false }))));
    const saem = new Set(resultados.filter((r) => r.gone).map((r) => r.endpoint));
    s.inscricoes = s.inscricoes.filter((i) => !saem.has(i.endpoint));
    const entregue = resultados.some((r) => r.status >= 200 && r.status < 300);
    if (!entregue && s.inscricoes.length) s.falhas[evento] = (s.falhas[evento] ?? 0) + 1;
    const resolvido = entregue || !s.inscricoes.length || s.falhas[evento] >= MAX_FALHAS_AVISO;
    if (resolvido) delete s.falhas[evento];
    return resolvido;
  }

  webSocketMessage() { /* a página não manda nada; só recebe */ }

  webSocketClose(ws) {
    try { ws.close(1000, "fim"); } catch { /* já fechado */ }
  }

  webSocketError(ws) {
    try { ws.close(1011, "erro"); } catch { /* já fechado */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    await this.carregar();
    if (url.pathname === "/dados" && request.method === "POST") {
      if (!this.s?.t) {
        if (this.s?.encerrado) return json({ expirado: true }, 404);
        await this.iniciar(id, await request.text());
      }
      const dados = await this.ler();
      if (!dados) return json({ expirado: true }, 404);
      await this.agendar(dados);
      return json(dados);
    }
    if (url.pathname === "/ao-vivo" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.aoVivo(id, url.searchParams.get("debug") === "1");
    }
    if (url.pathname === "/avisos" && (request.method === "POST" || request.method === "DELETE")) {
      let corpo = null;
      try { corpo = JSON.parse(await request.text()); } catch { return json({ erro: "corpo inválido" }, 400); }
      return request.method === "POST" ? this.inscrever(id, corpo) : this.desinscrever(corpo);
    }
    if (url.pathname === "/recarregar" && request.method === "POST") {
      await this.recarregar(id, await request.text());
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/encerrar" && request.method === "POST") {
      await this.encerrar();
      return new Response(null, { status: 204 });
    }
    return new Response("Não encontrado", { status: 404 });
  }
}
