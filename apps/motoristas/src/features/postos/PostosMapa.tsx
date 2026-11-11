import maplibregl from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { indicadorNoMapa, notaDoPosto, rotuloPrecoLitro, rotuloPrecoMapa, type PostoExibido } from "./postosDados";
import { CENTRO_PADRAO, ZOOM_INICIAL, type Area, type Posicao } from "./postosProximos";

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
  onSelecionar: (posto: PostoExibido) => void;
  onDesselecionar: () => void;
};

// Mesmo estilo gratuito (sem chave) do acompanhamento do motorista. A atribuição vem do próprio estilo: OpenFreeMap, OpenMapTiles e OpenStreetMap.
const ESTILO = "https://tiles.openfreemap.org/styles/positron";
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
  el.setAttribute("aria-label", [`Posto ${posto.nome}`, dados ? `${rotuloPrecoLitro(dados.precoLitro)}` : "", nota ? `${nota.texto} recomendam` : ""].filter(Boolean).join(", "));
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

export const PostosMapa = forwardRef<PostosMapaControle, Props>(function PostosMapa({ postos, posicao, selecionadoId, foco, onVista, onSelecionar, onDesselecionar }, ref) {
  const raiz = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pinos = useRef(new Map<string, { marcador: maplibregl.Marker; el: HTMLElement }>());
  const referencia = useRef<maplibregl.Marker | null>(null);
  const porId = useRef(new Map<string, PostoExibido>());
  // Os callbacks mudam a cada render; o mapa é criado uma vez e lê sempre o mais recente.
  const callbacks = useRef({ onVista, onSelecionar, onDesselecionar });
  callbacks.current = { onVista, onSelecionar, onDesselecionar };

  useImperativeHandle(ref, () => ({ aproximar: () => { mapa.current?.zoomIn(); }, afastar: () => { mapa.current?.zoomOut(); } }), []);

  useEffect(() => {
    if (!raiz.current) return;
    const instancia = new maplibregl.Map({
      container: raiz.current, style: ESTILO, center: [CENTRO_PADRAO.lon, CENTRO_PADRAO.lat], zoom: ZOOM_INICIAL, pitch: INCLINACAO,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0, attributionControl: false
    });
    instancia.touchZoomRotate.disableRotation();
    instancia.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-left");
    instancia.on("load", () => {
      // Prédios 3D dos mesmos tiles gratuitos, abaixo dos rótulos para os nomes de rua continuarem legíveis.
      const rotulos = instancia.getStyle().layers.find((camada) => camada.type === "symbol");
      if (instancia.getSource("openmaptiles")) {
        instancia.addLayer({
          id: "predios-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
          paint: { "fill-extrusion-color": "#f2f2f0", "fill-extrusion-opacity": 0.9, "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] }
        }, rotulos?.id);
      }
    });
    const marcarZoom = () => raiz.current?.classList.toggle("pp-mapa--etiquetas", instancia.getZoom() >= ZOOM_ETIQUETAS);
    instancia.on("zoom", marcarZoom);
    marcarZoom();
    // Visão geral fica de cima (pinos sem sobreposição); aproximado, inclina como no acompanhamento.
    instancia.on("zoomend", () => {
      const alvo = instancia.getZoom() >= ZOOM_INCLINA ? INCLINACAO : 0;
      if (Math.abs(instancia.getPitch() - alvo) > 0.5) instancia.easeTo({ pitch: alvo, duration: reduzMovimento() ? 0 : 300 });
    });
    instancia.on("moveend", () => callbacks.current.onVista(lerVista(instancia)));
    instancia.on("click", (evento) => {
      if ((evento.originalEvent.target as HTMLElement | null)?.closest(".pp-pino")) return;
      callbacks.current.onDesselecionar();
    });
    mapa.current = instancia;
    callbacks.current.onVista(lerVista(instancia));
    return () => { instancia.remove(); mapa.current = null; pinos.current.clear(); referencia.current = null; };
  }, []);

  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia) return;
    porId.current = new Map(postos.map((posto) => [posto.id, posto]));
    for (const [id, { marcador }] of pinos.current) {
      if (porId.current.has(id)) continue;
      marcador.remove();
      pinos.current.delete(id);
    }
    for (const posto of postos) {
      const existente = pinos.current.get(posto.id);
      if (existente) { atualizarPino(existente.el, posto); continue; }
      const el = criarPino(() => { const atual = porId.current.get(posto.id); if (atual) callbacks.current.onSelecionar(atual); });
      const marcador = new maplibregl.Marker({ element: el, anchor: "bottom", pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat([posto.lon, posto.lat]).addTo(instancia);
      atualizarPino(el, posto);
      pinos.current.set(posto.id, { marcador, el });
    }
  }, [postos]);

  useEffect(() => {
    for (const [id, { marcador, el }] of pinos.current) {
      const ativo = id === selecionadoId;
      el.classList.toggle("is-selecionado", ativo);
      el.setAttribute("aria-pressed", String(ativo));
      marcador.getElement().style.zIndex = ativo ? "3" : "";
    }
  }, [selecionadoId, postos]);

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
