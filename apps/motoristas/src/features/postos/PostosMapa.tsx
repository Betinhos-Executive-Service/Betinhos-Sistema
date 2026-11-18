import maplibregl from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { indicadorNoMapa, notaDoPosto, rotuloPrecoLitro, rotuloPrecoMapa, type PostoExibido } from "./postosDados";
import type { Posicao } from "../despesas/rankingPostos";
import { CENTRO_PADRAO, ZOOM_INICIAL, type Area } from "./postosProximos";

export type Vista = { area: Area; zoom: number };
/** Pedido para o mapa centralizar um ponto. `deslocamentoY` empurra o ponto para cima (cartão aberto embaixo). */
export type Foco = { lat: number; lon: number; zoom?: number; deslocamentoY?: number; chave: number };
export type PostosMapaControle = { aproximar: () => void; afastar: () => void };

type Props = {
  postos: PostoExibido[];
  posicao: Posicao | null;
  selecionadoId: string;
  foco: Foco | null;
  onVista: (vista: Vista) => void;
  /** O motorista arrastou ou deu zoom no mapa (gesto, não botão nem movimento do app). */
  onMoveuSozinho: () => void;
  onSelecionar: (posto: PostoExibido) => void;
  onDesselecionar: () => void;
};

// Mesmo estilo gratuito (sem chave) do acompanhamento do motorista. A atribuição vem do próprio estilo: OpenFreeMap, OpenMapTiles e OpenStreetMap.
const ESTILO = "https://tiles.openfreemap.org/styles/positron";
// Postos agrupados pelo próprio MapLibre quando afastados; os pinos individuais seguem como HTML (cor, etiqueta de preço) a partir daí.
const FONTE = "postos";
const CAMADA_GRUPOS = "pp-grupos";
const RAIO_AGRUPAR = 48;
const ZOOM_MAXIMO_AGRUPAR = 14;
const INCLINACAO = 45;
const ZOOM_INCLINA = 13;
// Gota com ponta em (20, 52), o rodapé do viewBox: o marcador ancora em "bottom" e a ponta cai exatamente na coordenada.
// O ícone é o Fuel do lucide (viewBox 24) a 75%, centrado no círculo da gota.
const PINO_SVG = '<svg viewBox="0 0 40 52" aria-hidden="true"><path class="pp-pino-corpo" d="M20 52C20 52 3 35 3 20 3 10.6 10.6 3 20 3s17 7.6 17 17c0 15-17 32-17 32Z"/><g class="pp-pino-icone" transform="translate(11 11) scale(.75)"><line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/></g></svg>';
/** A partir deste zoom o pino ganha a etiqueta de preço; abaixo, só o pino (muitos postos juntos poluem). */
const ZOOM_ETIQUETAS = 13;
const TONS = ["verde", "amarelo", "vermelho", "sem"] as const;

function criarPino(aoTocar: () => void) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pp-pino pp-pino--sem";
  el.innerHTML = `<span class="pp-pino-fig">${PINO_SVG}<span class="pp-pino-etiqueta" hidden><b></b><i></i></span></span>`;
  el.addEventListener("click", (evento) => { evento.stopPropagation(); aoTocar(); });
  return el;
}

/** Cor e etiqueta do pino a partir do preço (semáforo) e da recomendação; sem preço fica neutro e menor. */
function atualizarPino(el: HTMLElement, posto: PostoExibido) {
  const dados = posto.dados;
  for (const tom of TONS) el.classList.toggle(`pp-pino--${tom}`, tom === (dados?.cor ?? "sem"));
  const etiqueta = el.querySelector<HTMLElement>(".pp-pino-etiqueta");
  const indicador = dados ? indicadorNoMapa(dados.avaliacoes) : null;
  if (etiqueta) {
    etiqueta.hidden = !dados;
    const preco = etiqueta.querySelector("b");
    if (preco) preco.textContent = dados ? rotuloPrecoMapa(dados.precoLitro) : "";
    if (indicador) etiqueta.dataset.nota = indicador; else delete etiqueta.dataset.nota;
  }
  const nota = dados ? notaDoPosto(dados.avaliacoes) : null;
  el.setAttribute("aria-label", [`Posto ${posto.nome}`, dados ? rotuloPrecoLitro(dados.precoLitro) : "", nota ? `${nota.texto} recomendam` : ""].filter(Boolean).join(", "));
}

function criarPonto(classe: string, rotulo: string) {
  const el = document.createElement("div");
  el.className = classe;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", rotulo);
  el.innerHTML = "<span></span>";
  return el;
}

function lerVista(mapa: maplibregl.Map): Vista {
  const limites = mapa.getBounds();
  return { area: { sul: limites.getSouth(), norte: limites.getNorth(), oeste: limites.getWest(), leste: limites.getEast() }, zoom: mapa.getZoom() };
}

const reduzMovimento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export const PostosMapa = forwardRef<PostosMapaControle, Props>(function PostosMapa({ postos, posicao, selecionadoId, foco, onVista, onMoveuSozinho, onSelecionar, onDesselecionar }, ref) {
  const raiz = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pinos = useRef(new Map<string, { marcador: maplibregl.Marker; el: HTMLElement }>());
  const referencia = useRef<maplibregl.Marker | null>(null);
  const porId = useRef(new Map<string, PostoExibido>());
  // Os callbacks mudam a cada render; o mapa é criado uma vez e lê sempre o mais recente.
  const callbacks = useRef({ onVista, onMoveuSozinho, onSelecionar, onDesselecionar });
  callbacks.current = { onVista, onMoveuSozinho, onSelecionar, onDesselecionar };

  const geojson = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>({ type: "FeatureCollection", features: [] });
  const selecionado = useRef(selecionadoId);
  selecionado.current = selecionadoId;

  /** Pinos HTML = postos fora de grupos nos tiles carregados + o selecionado; cria os que faltam e remove os que saíram. */
  const sincronizarPinos = () => {
    const instancia = mapa.current;
    if (!instancia?.getSource(FONTE)) return;
    const desejados = new Set(instancia.querySourceFeatures(FONTE, { filter: ["!", ["has", "point_count"]] }).map((f) => String(f.properties?.id)));
    if (selecionado.current) desejados.add(selecionado.current);
    for (const [id, { marcador }] of pinos.current) {
      if (desejados.has(id) && porId.current.has(id)) continue;
      marcador.remove();
      pinos.current.delete(id);
    }
    for (const id of desejados) {
      const posto = porId.current.get(id);
      if (!posto || pinos.current.has(id)) continue;
      const el = criarPino(() => { const atual = porId.current.get(id); if (atual) callbacks.current.onSelecionar(atual); });
      const marcador = new maplibregl.Marker({ element: el, anchor: "bottom", pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat([posto.lon, posto.lat]).addTo(instancia);
      atualizarPino(el, posto);
      pinos.current.set(id, { marcador, el });
    }
    marcarSelecionado();
  };
  const marcarSelecionado = () => {
    for (const [id, { marcador, el }] of pinos.current) {
      const ativo = id === selecionado.current;
      el.classList.toggle("is-selecionado", ativo);
      el.setAttribute("aria-pressed", String(ativo));
      marcador.getElement().style.zIndex = ativo ? "3" : "";
    }
  };

  useImperativeHandle(ref, () => ({ aproximar: () => { mapa.current?.zoomIn(); }, afastar: () => { mapa.current?.zoomOut(); } }), []);

  useEffect(() => {
    if (!raiz.current) return;
    const instancia = new maplibregl.Map({
      container: raiz.current, style: ESTILO, center: [CENTRO_PADRAO.lon, CENTRO_PADRAO.lat], zoom: ZOOM_INICIAL, pitch: INCLINACAO,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0, attributionControl: false
    });
    instancia.touchZoomRotate.disableRotation();
    instancia.addControl(new maplibregl.AttributionControl({ compact: false }), "top-left");
    // Roda a cada estilo carregado (o primeiro e as trocas de tema, que descartam fontes e camadas).
    instancia.on("style.load", () => {
      // Prédios 3D dos mesmos tiles gratuitos, abaixo dos rótulos para os nomes de rua continuarem legíveis.
      const rotulos = instancia.getStyle().layers.find((camada) => camada.type === "symbol");
      if (instancia.getSource("openmaptiles")) {
        instancia.addLayer({
          id: "predios-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
          paint: { "fill-extrusion-color": "#f2f2f0", "fill-extrusion-opacity": 0.9, "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] }
        }, rotulos?.id);
      }
      instancia.addSource(FONTE, { type: "geojson", data: geojson.current, cluster: true, clusterRadius: RAIO_AGRUPAR, clusterMaxZoom: ZOOM_MAXIMO_AGRUPAR });
      instancia.addLayer({ id: CAMADA_GRUPOS, type: "circle", source: FONTE, filter: ["has", "point_count"], paint: { "circle-color": "#2159d2", "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 26], "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
      instancia.addLayer({ id: `${CAMADA_GRUPOS}-contagem`, type: "symbol", source: FONTE, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 14, "text-allow-overlap": true }, paint: { "text-color": "#ffffff" } });
    });
    // Pinos individuais = pontos não agrupados nos tiles carregados (mais o selecionado, que nunca some dentro de um grupo).
    instancia.on("sourcedata", (evento) => { if (evento.sourceId === FONTE && evento.isSourceLoaded) sincronizarPinos(); });
    instancia.on("mouseenter", CAMADA_GRUPOS, () => { instancia.getCanvas().style.cursor = "pointer"; });
    instancia.on("mouseleave", CAMADA_GRUPOS, () => { instancia.getCanvas().style.cursor = ""; });
    const marcarZoom = () => raiz.current?.classList.toggle("pp-mapa--etiquetas", instancia.getZoom() >= ZOOM_ETIQUETAS);
    instancia.on("zoom", marcarZoom);
    marcarZoom();
    // Visão geral fica de cima (pinos sem sobreposição); aproximado, inclina como no acompanhamento.
    instancia.on("zoomend", () => {
      const alvo = instancia.getZoom() >= ZOOM_INCLINA ? INCLINACAO : 0;
      if (Math.abs(instancia.getPitch() - alvo) > 0.5) instancia.easeTo({ pitch: alvo, duration: reduzMovimento() ? 0 : 300 });
    });
    // Só gestos do motorista trazem originalEvent; botões +/− e os movimentos do app não.
    const aoGesto = (evento: { originalEvent?: unknown }) => { if (evento.originalEvent) callbacks.current.onMoveuSozinho(); };
    instancia.on("dragstart", aoGesto);
    instancia.on("zoomstart", aoGesto);
    instancia.on("moveend", () => { callbacks.current.onVista(lerVista(instancia)); sincronizarPinos(); });
    instancia.on("click", (evento) => {
      if (evento.originalEvent.target instanceof Element && evento.originalEvent.target.closest(".pp-pino")) return;
      const grupo = instancia.getLayer(CAMADA_GRUPOS) ? instancia.queryRenderedFeatures(evento.point, { layers: [CAMADA_GRUPOS] })[0] : undefined;
      if (!grupo) { callbacks.current.onDesselecionar(); return; }
      // Tocar no grupo aproxima até ele se abrir em pinos.
      const fonte = instancia.getSource(FONTE) as maplibregl.GeoJSONSource | undefined;
      fonte?.getClusterExpansionZoom(Number(grupo.properties?.cluster_id)).then((zoom) => {
        instancia.easeTo({ center: (grupo.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5, duration: reduzMovimento() ? 0 : 500 });
      }, () => { /* Grupo já aberto por outro movimento. */ });
    });
    mapa.current = instancia;
    callbacks.current.onVista(lerVista(instancia));
    return () => { instancia.remove(); mapa.current = null; pinos.current.clear(); referencia.current = null; };
  }, []);

  // Postos novos: atualiza a fonte (os grupos se refazem) e os pinos já na tela (ranking chegou, nota mudou).
  useEffect(() => {
    porId.current = new Map(postos.map((posto) => [posto.id, posto]));
    geojson.current = { type: "FeatureCollection", features: postos.map((posto) => ({ type: "Feature", properties: { id: posto.id }, geometry: { type: "Point", coordinates: [posto.lon, posto.lat] } })) };
    (mapa.current?.getSource(FONTE) as maplibregl.GeoJSONSource | undefined)?.setData(geojson.current);
    for (const [id, { el }] of pinos.current) { const posto = porId.current.get(id); if (posto) atualizarPino(el, posto); }
    sincronizarPinos();
  }, [postos]);

  useEffect(() => { sincronizarPinos(); }, [selecionadoId]);

  // "Você" (GPS) ou, sem GPS, o ponto de referência das distâncias.
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia) return;
    referencia.current?.remove();
    const ponto = posicao ?? CENTRO_PADRAO;
    const el = posicao ? criarPonto("pp-voce", "Sua posição") : criarPonto("pp-centro", "Centro de São José dos Campos");
    referencia.current = new maplibregl.Marker({ element: el, pitchAlignment: "viewport" }).setLngLat([ponto.lon, ponto.lat]).addTo(instancia);
  }, [posicao]);

  useEffect(() => {
    const instancia = mapa.current;
    if (!foco || !instancia) return;
    instancia.easeTo({ center: [foco.lon, foco.lat], zoom: foco.zoom ?? instancia.getZoom(), offset: [0, -(foco.deslocamentoY ?? 0) / 2], duration: reduzMovimento() ? 0 : 600 });
  }, [foco]);

  return <div ref={raiz} className="pp-mapa" role="application" aria-label="Mapa de postos" />;
});
