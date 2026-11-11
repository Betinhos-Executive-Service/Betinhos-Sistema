import * as L from "leaflet";
import { useEffect, useRef } from "react";
import { CENTRO_PADRAO, ZOOM_INICIAL, type Area, type Posicao, type Posto } from "./postosProximos";

export type Vista = { area: Area; zoom: number; centro: Posicao };
export type Foco = { lat: number; lon: number; zoom?: number; chave: number };

type Props = {
  postos: Posto[];
  posicao: Posicao | null;
  selecionadoId: string;
  foco: Foco | null;
  onVista: (vista: Vista) => void;
  onSelecionar: (posto: Posto) => void;
  onDesselecionar: () => void;
};

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const PINO_SVG = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.2 12 30 12 30s12-9.8 12-18.3C24 5.2 18.6 0 12 0Z"/><circle cx="12" cy="11.5" r="4.6"/></svg>';

// Pino e "você" em divIcon/CSS: o ícone padrão do Leaflet usa imagens por URL, que quebram no arquivo único do web resource.
const iconePosto = (selecionado: boolean) => L.divIcon({ className: `pp-pino${selecionado ? " is-selecionado" : ""}`, html: PINO_SVG, iconSize: [30, 38], iconAnchor: [15, 38] });
const iconeVoce = L.divIcon({ className: "pp-voce", html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] });

function lerVista(mapa: L.Map): Vista {
  const limites = mapa.getBounds();
  const centro = mapa.getCenter();
  return { area: { sul: limites.getSouth(), norte: limites.getNorth(), oeste: limites.getWest(), leste: limites.getEast() }, zoom: mapa.getZoom(), centro: { lat: centro.lat, lon: centro.lng } };
}

export function PostosMapa({ postos, posicao, selecionadoId, foco, onVista, onSelecionar, onDesselecionar }: Props) {
  const raiz = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const pinos = useRef(new Map<string, L.Marker>());
  const voce = useRef<L.Marker | null>(null);
  // Os callbacks mudam a cada render; o mapa é criado uma vez e lê sempre o mais recente.
  const callbacks = useRef({ onVista, onSelecionar, onDesselecionar });
  callbacks.current = { onVista, onSelecionar, onDesselecionar };
  const porId = useRef(new Map<string, Posto>());

  useEffect(() => {
    if (!raiz.current) return;
    const instancia = L.map(raiz.current, { center: [CENTRO_PADRAO.lat, CENTRO_PADRAO.lon], zoom: ZOOM_INICIAL, zoomControl: false, attributionControl: false });
    L.tileLayer(TILES, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(instancia);
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(instancia);
    L.control.zoom({ position: "topright", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(instancia);
    instancia.on("moveend", () => callbacks.current.onVista(lerVista(instancia)));
    instancia.on("click", () => callbacks.current.onDesselecionar());
    mapa.current = instancia;
    callbacks.current.onVista(lerVista(instancia));
    return () => { instancia.remove(); mapa.current = null; pinos.current.clear(); voce.current = null; };
  }, []);

  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia) return;
    porId.current = new Map(postos.map((posto) => [posto.id, posto]));
    for (const [id, marcador] of pinos.current) {
      if (porId.current.has(id)) continue;
      marcador.remove();
      pinos.current.delete(id);
    }
    for (const posto of postos) {
      if (pinos.current.has(posto.id)) continue;
      const marcador = L.marker([posto.lat, posto.lon], { icon: iconePosto(false), title: posto.nome, keyboard: true, riseOnHover: true });
      marcador.on("click", (evento) => {
        L.DomEvent.stopPropagation(evento);
        const atual = porId.current.get(posto.id);
        if (atual) callbacks.current.onSelecionar(atual);
      });
      marcador.addTo(instancia);
      pinos.current.set(posto.id, marcador);
    }
  }, [postos]);

  useEffect(() => {
    for (const [id, marcador] of pinos.current) {
      marcador.setIcon(iconePosto(id === selecionadoId));
      marcador.setZIndexOffset(id === selecionadoId ? 1000 : 0);
    }
  }, [selecionadoId, postos]);

  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia) return;
    voce.current?.remove();
    voce.current = posicao ? L.marker([posicao.lat, posicao.lon], { icon: iconeVoce, interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(instancia) : null;
  }, [posicao]);

  useEffect(() => {
    if (!foco || !mapa.current) return;
    mapa.current.setView([foco.lat, foco.lon], foco.zoom ?? mapa.current.getZoom(), { animate: true });
  }, [foco]);

  return <div ref={raiz} className="pp-mapa" role="application" aria-label="Mapa de postos" />;
}
