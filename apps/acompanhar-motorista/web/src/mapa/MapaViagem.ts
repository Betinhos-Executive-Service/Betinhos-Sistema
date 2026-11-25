// Mapa da viagem (MapLibre, tiles vetoriais gratuitos OpenFreeMap, sem chave), inclinado 45° com prédios 3D.
// Sem rotação: o carro gira, o mapa não. Controlador imperativo: o React só entrega dados novos (atualizar) e lê dois eventos
// (usuário mexeu no mapa; sequência final terminou). Uma única instância; o mapa ampliado é o mesmo mapa com resize().
import type { Map as MapaMl, Marker, LngLatBoundsLike } from "maplibre-gl";
import { carroNaRota, giro, interpolar, planoDeMovimento, rumoDaRota, rumoDoPercorrido } from "../../../src/movimento.mjs";
import { INTERVALO_MS } from "../bt";
import type { Dados, Etapa } from "../tipos";
import { distanciaKm } from "../util";

type Coord = [number, number];
type Ml = typeof import("maplibre-gl");
const CARRO_NA_ROTA_M = 30; // carro a até 30 m da rota é desenhado nela
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const VAZIO = { type: "FeatureCollection", features: [] } as const;

export interface OpcoesMapa {
  container: HTMLElement;
  caixa: HTMLElement; // .mapa-caixa: o tamanho dele manda no enquadramento
  tomtom: boolean;
  desktop: boolean;
  debug: boolean;
  reduzMovimento: boolean;
  corRota: string;
  rotuloVeiculo: string;
  rotuloEtapa: (n: number) => string;
  aoMexer: () => void; // arrastou ou deu zoom: para de seguir o carro
  aoSeguir: (sim: boolean) => void; // a sequência final volta a "seguir"
  aoMostrarCard: () => void; // fim da sequência de conclusão (ou plano B)
  aoDiagnostico: (texto: string) => void;
}

const estadoEtapa = (e: Etapa) => (e.atual ? "atual" : e.visitada ? "feita" : "futura");
const temCoord = (e: Etapa) => typeof e.lat === "number" && typeof e.lon === "number";
const linha = (c: Coord[] | null | undefined) => (c && c.length > 1 ? { type: "Feature", geometry: { type: "LineString", coordinates: c } } : VAZIO);

export class MapaViagem {
  private ml!: Ml;
  private mapa!: MapaMl;
  private pronto = false;
  private morto = false;
  private dados: Dados | null = null;
  private rotaCoords: Coord[] | null = null;
  private percorridoCoords: Coord[] | null = null;
  private rotaDesenhada: string | null = null;
  private fimMapa = false;
  private fimIniciado = false;
  private fimTimer: ReturnType<typeof setTimeout> | undefined;
  private fimQuadro = 0;
  private trajetoFinal: Coord[] | null = null;
  private carro: Marker | null = null;
  private seta: HTMLElement | null = null;
  private exibida: { lat: number; lon: number } | null = null;
  private rumoAcumulado = 0;
  private rumoDefinido = false;
  private anim = 0;
  private saltarProxima = false;
  private etapaMk: Marker[] = [];
  private embarqueMk: Marker | null = null;
  private enquadrado = false;
  private mexeu = false;
  private ro?: ResizeObserver;

  private constructor(private op: OpcoesMapa) {}

  // A biblioteca (e o CSS dela) vêm em chunk separado: o painel aparece antes e o link inválido nunca baixa o mapa.
  static async criar(op: OpcoesMapa, dados: Dados | null): Promise<MapaViagem> {
    // O worker do MapLibre 6 é um arquivo próprio: sem apontar a URL emitida pelo Vite ele pede /assets/maplibre-gl-worker.mjs (404).
    const [mod, worker] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"), import("maplibre-gl/dist/maplibre-gl.css")]);
    const m = new MapaViagem(op);
    m.ml = (mod as any).default ?? mod;
    m.ml.setWorkerUrl(worker.default);
    m.iniciar(dados);
    return m;
  }

  // Concluído sem posição ao vivo: o mapa abre deitado na saída e a sequência final o deita em 2D.
  private ponto0(): Coord | null {
    const d = this.dados, e = d && d.etapas && d.etapas[0];
    return e ? [e.lon!, e.lat!] : d && d.embarque ? [d.embarque.lon, d.embarque.lat] : null;
  }
  private inicioMapa(): Coord { const d = this.dados; return d && d.posicao ? [d.posicao.lon, d.posicao.lat] : this.ponto0() || [-46.63, -23.55]; }

  private iniciar(dados: Dados | null) {
    const { op, ml } = this;
    this.dados = dados;
    const mapa = (this.mapa = new ml.Map({
      container: op.container, style: "https://tiles.openfreemap.org/styles/positron", center: this.inicioMapa(), zoom: dados && (dados.posicao || this.ponto0()) ? 14 : 10, pitch: 45,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
      attributionControl: { compact: true, customAttribution: op.tomtom ? "Rotas &copy; TomTom" : "" },
    }));
    mapa.touchZoomRotate.disableRotation();
    // O MapLibre abre a atribuição compacta expandida em telas largas: aqui ela nasce recolhida no "i" (celular e desktop) e só abre no clique.
    const recolher = () => op.container.querySelectorAll(".maplibregl-compact-show").forEach((el) => el.classList.remove("maplibregl-compact-show"));
    recolher();
    if (op.desktop) mapa.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
    mapa.on("load", () => {
      recolher();
      // Prédios 3D dos mesmos tiles gratuitos; entram abaixo dos rótulos para os nomes de rua continuarem legíveis.
      const rotulos = mapa.getStyle().layers.find((l) => l.type === "symbol");
      if (mapa.getSource("openmaptiles")) mapa.addLayer({ id: "predios-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
        paint: { "fill-extrusion-color": "#f2f2f0", "fill-extrusion-opacity": 0.9,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] } }, rotulos && rotulos.id);
      // Caminho já feito (cinza, como no Waze) por baixo da rota que falta.
      mapa.addSource("percorrido", { type: "geojson", data: VAZIO as any });
      mapa.addLayer({ id: "percorrido-borda", type: "line", source: "percorrido", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 } });
      mapa.addLayer({ id: "percorrido", type: "line", source: "percorrido", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#9aa3b2", "line-width": 4 } });
      mapa.addSource("rota", { type: "geojson", data: VAZIO as any });
      mapa.addLayer({ id: "rota-borda", type: "line", source: "rota", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      mapa.addLayer({ id: "rota", type: "line", source: "rota", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": op.corRota, "line-width": 5 } });
      // Modo diagnóstico (?debug=1): trilha do GPS (cinza), leitura crua (vermelho) e ponto encaixado (verde).
      if (op.debug) {
        mapa.addSource("diag", { type: "geojson", data: VAZIO as any });
        mapa.addLayer({ id: "diag", type: "circle", source: "diag", paint: { "circle-radius": 5, "circle-color": ["get", "cor"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      }
      this.pronto = true; this.desenharRota();
    });
    for (const ev of ["dragstart", "zoomstart"] as const) mapa.on(ev, (e: any) => { if (e.originalEvent) { this.mexeu = true; op.aoMexer(); } });
    this.ro = new ResizeObserver(() => { mapa.resize(); if (this.enquadrado && !this.mexeu) this.enquadrar(false); });
    this.ro.observe(op.caixa);
    if (dados) this.renderMapa(dados);
  }

  destruir() {
    this.morto = true;
    cancelAnimationFrame(this.anim); cancelAnimationFrame(this.fimQuadro); clearTimeout(this.fimTimer);
    this.ro?.disconnect();
    try { this.mapa.remove(); } catch { /* já removido */ }
  }
  redimensionar() { this.mapa.resize(); }
  marcarSalto() { this.saltarProxima = true; }
  traduzir(rotuloVeiculo: string, rotuloEtapa: (n: number) => string) {
    this.op.rotuloVeiculo = rotuloVeiculo; this.op.rotuloEtapa = rotuloEtapa;
    this.etapaMk.forEach((mk, i) => mk.getElement().setAttribute("aria-label", rotuloEtapa(i + 1)));
    this.carro?.getElement().setAttribute("aria-label", rotuloVeiculo);
  }
  seguir(sim: boolean) { this.mexeu = !sim; }
  centrar() { this.mexeu = false; this.enquadrar(true); }

  // ---- Desenho da rota ----
  private desenharRota() {
    const rc = this.rotaCoords, pc = this.percorridoCoords;
    const chave = JSON.stringify([rc && rc.length, rc && rc[0], pc && pc.length, pc && pc[pc.length - 1]]);
    if (!this.pronto || chave === this.rotaDesenhada) return;
    this.rotaDesenhada = chave;
    if (!this.fimMapa) (this.mapa.getSource("percorrido") as any).setData(linha(pc));
    (this.mapa.getSource("rota") as any).setData(linha(rc));
  }
  private marcador(html: string, classe: string, titulo: string) {
    const el = document.createElement("div");
    el.className = classe; el.innerHTML = html; el.setAttribute("aria-label", titulo); el.setAttribute("role", "img");
    return el;
  }

  // ---- Carro: desliza entre posições e aponta para onde vai ----
  // Sprite 3D com 16 rumos (a cada 22,5°) numa grade 4x4 de 80px: troca o quadro conforme o rumo.
  private girar(novo: number) {
    this.rumoAcumulado += giro(((this.rumoAcumulado % 360) + 360) % 360, novo);
    const q = Math.round((((this.rumoAcumulado % 360) + 360) % 360) / 22.5) % 16;
    this.seta!.style.backgroundPosition = -(q % 4) * 80 + "px " + -Math.floor(q / 4) * 80 + "px";
  }
  // Para onde o carro aponta: a rota que falta manda (segue a rua mesmo parado ou com GPS ruidoso); sem rota, o
  // deslocamento entre leituras; sem os dois, o fim do caminho já feito.
  private rumoAlvo(para: { lat: number; lon: number }, rumoMovimento: number | null) {
    let r = rumoDaRota(para, this.rotaCoords);
    if (r === null) r = rumoMovimento;
    if (r === null && !this.rumoDefinido) r = rumoDoPercorrido(this.percorridoCoords);
    return r;
  }
  private moverCarro(para: { lat: number; lon: number }) {
    if (!this.carro) {
      const el = this.marcador('<span class="carro-seta"></span>', "carro", this.op.rotuloVeiculo);
      this.seta = el.firstChild as HTMLElement;
      this.carro = new this.ml.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "viewport" }).setLngLat([para.lon, para.lat]).addTo(this.mapa);
      this.exibida = para; this.saltarProxima = false;
      const r0 = this.rumoAlvo(para, null);
      if (r0 !== null) { this.girar(r0); this.rumoDefinido = true; }
      return;
    }
    const plano = planoDeMovimento(this.exibida, para, { intervaloMs: INTERVALO_MS, oculto: this.saltarProxima, reduzMovimento: this.op.reduzMovimento });
    // Na volta do segundo plano, a primeira leitura pode ser a de antes (cache curto do Viagem): o salto espera o primeiro movimento.
    if (plano.modo !== "parado") this.saltarProxima = false;
    const alvo = this.rumoAlvo(para, plano.rumo);
    if (alvo !== null) { this.girar(alvo); this.rumoDefinido = true; }
    cancelAnimationFrame(this.anim);
    if (plano.modo === "parado") return;
    if (plano.modo === "saltar") { this.carro.setLngLat([para.lon, para.lat]); this.exibida = para; return; }
    const de = this.exibida!, inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / plano.duracaoMs), p = interpolar(de, para, t);
      this.carro!.setLngLat([p.lon, p.lat]); this.exibida = p;
      if (t < 1) this.anim = requestAnimationFrame(passo);
    };
    passo(inicio);
  }

  // ---- Enquadramento: margem para o carro 3D (80 px) e os botões do mapa; vale para a miniatura e para o mapa ampliado ----
  private folga() {
    const c = this.op.caixa.getBoundingClientRect(), v = Math.min(48, Math.round(c.height / 4)), h = Math.min(40, Math.round(c.width / 6));
    return { top: v, bottom: v, left: h, right: h };
  }
  private pontosDeInteresse(): Coord[] {
    let pts: Coord[] = [];
    if (this.exibida) pts.push([this.exibida.lon, this.exibida.lat]);
    // Com carro: só ele, a próxima parada e a rota até ela. Paradas feitas e futuras ficam de fora, senão o zoom vai
    // para a região inteira (ex.: ✓ em Jacareí com o carro em Guarulhos). Sem carro, enquadra todas as paradas.
    this.etapaMk.forEach((mk) => { if (!this.exibida || mk.getElement().getAttribute("data-est") === "atual") pts.push(mk.getLngLat().toArray() as Coord); });
    if (this.embarqueMk) pts.push(this.embarqueMk.getLngLat().toArray() as Coord);
    if (this.rotaCoords) pts = pts.concat(this.rotaCoords);
    if (this.fimMapa && this.trajetoFinal) pts = pts.concat(this.trajetoFinal);
    return pts;
  }
  private limites(pts: Coord[]) { return pts.reduce((acc, c) => acc.extend(c), new this.ml.LngLatBounds(pts[0], pts[0])) as LngLatBoundsLike; }
  private enquadrar(animado: boolean) {
    const pts = this.pontosDeInteresse();
    if (pts.length === 1) this.mapa.easeTo({ center: pts[0], zoom: 15, padding: this.folga(), duration: animado ? 600 : 0 });
    else if (pts.length) this.mapa.fitBounds(this.limites(pts), { padding: this.folga(), duration: animado ? 600 : 0, maxZoom: 16 });
  }
  // Enquanto o usuário não mexeu no mapa, o enquadramento acompanha o carro a cada atualização.
  private reenquadrarSeguindo() { if (!this.mexeu) this.enquadrar(this.enquadrado); this.enquadrado = true; }

  // ---- Sequência de conclusão: mapa deita em 2D e enquadra → linha do trajeto se desenha → card entra ----
  private mostrarCard() { clearTimeout(this.fimTimer); this.op.aoMostrarCard(); }
  // Desenha a linha crescendo da saída ao destino (ease-out), por distância acumulada.
  private desenharTrajeto(coords: Coord[] | null, ms: number, fim: () => void) {
    const { mapa } = this, src = mapa.getSource("percorrido") as any;
    mapa.setPaintProperty("percorrido", "line-color", this.op.corRota); mapa.setPaintProperty("percorrido", "line-width", 5);
    if (!coords || coords.length < 2) { src.setData(linha(null)); return fim(); }
    if (this.op.reduzMovimento) { src.setData(linha(coords)); return fim(); }
    const acum = [0];
    for (let i = 1; i < coords.length; i++) acum.push(acum[i - 1] + distanciaKm([coords[i - 1], coords[i]]));
    const total = acum[acum.length - 1] || 1, t0 = performance.now();
    const quadro = (agora: number) => {
      if (this.morto) return;
      const k = Math.min(1, (agora - t0) / ms), alvo = (1 - Math.pow(1 - k, 3)) * total;
      let j = 1;
      while (j < acum.length - 1 && acum[j] < alvo) j++;
      const f = acum[j] === acum[j - 1] ? 1 : Math.min(1, (alvo - acum[j - 1]) / (acum[j] - acum[j - 1]));
      const ponta: Coord = [coords[j - 1][0] + (coords[j][0] - coords[j - 1][0]) * f, coords[j - 1][1] + (coords[j][1] - coords[j - 1][1]) * f];
      src.setData(linha(coords.slice(0, j).concat([ponta])));
      if (k < 1) this.fimQuadro = requestAnimationFrame(quadro); else { src.setData(linha(coords)); fim(); }
    };
    this.fimQuadro = requestAnimationFrame(quadro);
  }
  private sequenciaFinal(d: Dados) {
    if (this.fimIniciado) return;
    const { mapa } = this;
    this.fimIniciado = true; this.fimMapa = true; this.trajetoFinal = (d.percorrido as Coord[]) || null;
    this.mexeu = false; this.op.aoSeguir(true);
    clearTimeout(this.fimTimer); this.fimTimer = setTimeout(() => this.mostrarCard(), 3500); // plano B: mapa lento, o card não fica escondido
    const pts = this.pontosDeInteresse();
    const inicio = () => {
      const depois = () => this.desenharTrajeto(this.trajetoFinal, 1200, () => this.mostrarCard());
      if (!pts.length) return depois();
      const b = this.limites(pts);
      if (this.op.reduzMovimento) { mapa.fitBounds(b, { padding: this.folga(), duration: 0, maxZoom: 16, pitch: 0, bearing: 0 }); mapa.setPitch(0); this.enquadrado = true; return depois(); }
      mapa.once("moveend", () => { this.enquadrado = true; depois(); });
      mapa.fitBounds(b, { padding: this.folga(), duration: 800, maxZoom: 16, pitch: 0, bearing: 0, easing: (x: number) => 1 - Math.pow(1 - x, 3) });
    };
    if (this.pronto) inicio(); else mapa.once("load", () => requestAnimationFrame(inicio));
  }

  // ---- Marcadores de parada ----
  private marcadoresEtapas(lista: Etapa[]) {
    const comCoord = lista.filter(temCoord);
    if (this.etapaMk.length !== comCoord.length) {
      this.etapaMk.forEach((mk) => mk.remove()); this.etapaMk = [];
      comCoord.forEach((e, i) => {
        this.etapaMk.push(new this.ml.Marker({ element: this.marcador(String(i + 1), "mk-etapa", this.op.rotuloEtapa(i + 1)) }).setLngLat([e.lon!, e.lat!]).addTo(this.mapa));
      });
    }
    comCoord.forEach((e, j) => {
      const el = this.etapaMk[j].getElement(), est = estadoEtapa(e);
      if (el.getAttribute("data-est") === est) return;
      el.setAttribute("data-est", est);
      for (const k of ["atual", "feita", "futura"]) el.classList.toggle("mk-" + k, k === est);
      el.innerHTML = est === "feita" ? CHECK : String(j + 1);
    });
  }

  // Reserva agendada (sem carro nem paradas ainda): um pino no embarque, igual ao 1 do card, e o mapa centra nele.
  private marcadorEmbarque(d: Dados) {
    const e = d.embarque, precisa = !!e && !d.posicao && !(d.etapas || []).some(temCoord);
    if (!precisa) { this.embarqueMk?.remove(); this.embarqueMk = null; return; }
    if (this.embarqueMk) this.embarqueMk.setLngLat([e!.lon, e!.lat]);
    else this.embarqueMk = new this.ml.Marker({ element: this.marcador("1", "mk-etapa mk-atual", this.op.rotuloEtapa(1)) }).setLngLat([e!.lon, e!.lat]).addTo(this.mapa);
  }

  private desenharDiagnostico(d: Dados) {
    const g = d.diagnostico;
    if (!this.op.debug || !g) return;
    const feats: unknown[] = [];
    const ponto = (c: Coord, cor: string) => feats.push({ type: "Feature", properties: { cor }, geometry: { type: "Point", coordinates: c } });
    (g.trilha || []).forEach((c: Coord) => ponto(c, "#8a93a3"));
    if (d.posicao) ponto([d.posicao.lon, d.posicao.lat], "#d93025");
    if (g.encaixada) ponto([g.encaixada.lon, g.encaixada.lat], "#188038");
    if (this.pronto && this.mapa.getSource("diag")) (this.mapa.getSource("diag") as any).setData({ type: "FeatureCollection", features: feats });
    this.op.aoDiagnostico("rota: " + g.decisao + (g.motivos && g.motivos.length ? " (" + g.motivos.join(", ") + ")" : "") +
      "\nrumo: " + (g.rumo == null ? "—" : Math.round(g.rumo) + "°") + " · " + (g.velocidadeKmh == null ? "parado" : g.velocidadeKmh + " km/h") +
      "\ntrilha: " + (g.trilha ? g.trilha.length : 0) + " pontos" + (g.encaixada ? " · encaixada" : ""));
  }

  // Chamado a cada /dados (e uma vez na criação, com os dados que já chegaram).
  atualizar(d: Dados) { this.dados = d; this.renderMapa(d); }
  private renderMapa(d: Dados) {
    if (this.morto) return;
    if (d.fase === "concluido") {
      // Encerrar: o carro sai, a rota que falta some e a sequência final deita o mapa e desenha o trajeto feito.
      if (this.carro) { cancelAnimationFrame(this.anim); this.carro.remove(); this.carro = null; this.exibida = null; }
      this.rotaCoords = null; this.percorridoCoords = null; this.desenharRota();
      this.marcadoresEtapas(d.etapas || []);
      this.sequenciaFinal(d);
      return;
    }
    this.marcadoresEtapas(d.etapas || []);
    this.marcadorEmbarque(d);
    this.rotaCoords = (d.rota && d.rota.coords) || null;
    this.percorridoCoords = d.percorrido || null;
    if (d.posicao) this.moverCarro(carroNaRota({ lat: d.posicao.lat, lon: d.posicao.lon }, this.rotaCoords, CARRO_NA_ROTA_M));
    this.desenharDiagnostico(d);
    this.desenharRota();
    this.reenquadrarSeguindo();
  }
}
