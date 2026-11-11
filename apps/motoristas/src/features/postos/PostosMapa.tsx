import maplibregl from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CENTRO_PADRAO, ZOOM_INICIAL, type Area, type Posicao, type Posto } from "./postosProximos";

export type Vista = { area: Area; zoom: number };
/** Pedido para o mapa centralizar um ponto. `deslocamentoY` empurra o ponto para cima (cartão aberto embaixo). */
export type Foco = { lat: number; lon: number; zoom?: number; deslocamentoY?: number; chave: number };
export type PostosMapaControle = { aproximar: () => void; afastar: () => void };

type Props = {
  postos: Posto[];
  posicao: Posicao | null;
  selecionadoId: string;
  foco: Foco | null;
  onVista: (vista: Vista) => void;
  onSelecionar: (posto: Posto) => void;
  onDesselecionar: () => void;
};

// Mesmo estilo gratuito (sem chave) do acompanhamento do motorista. A atribuição vem do próprio estilo: OpenFreeMap, OpenMapTiles e OpenStreetMap.
const ESTILO = "https://tiles.openfreemap.org/styles/positron";
const INCLINACAO = 45;
const ZOOM_INCLINA = 13;
const PINO_SVG = '<svg viewBox="0 0 34 42" aria-hidden="true"><path class="pp-pino-corpo" d="M17 1C8.2 1 1 7.9 1 16.4 1 27.6 17 41 17 41s16-13.4 16-24.6C33 7.9 25.8 1 17 1Z"/><g class="pp-pino-icone" transform="translate(9.5 8.5)"><path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18"/><path d="M2 22h12"/><path d="M13 9h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M5 8h6"/></g></svg>';

function criarPino(posto: Posto, aoTocar: () => void) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pp-pino";
  el.setAttribute("aria-label", `Posto ${posto.nome}`);
  el.innerHTML = PINO_SVG;
  el.addEventListener("click", (evento) => { evento.stopPropagation(); aoTocar(); });
  return el;
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
  const porId = useRef(new Map<string, Posto>());
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
      if (pinos.current.has(posto.id)) continue;
      const el = criarPino(posto, () => { const atual = porId.current.get(posto.id); if (atual) callbacks.current.onSelecionar(atual); });
      const marcador = new maplibregl.Marker({ element: el, anchor: "bottom", pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat([posto.lon, posto.lat]).addTo(instancia);
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
