import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardTrajeto } from "../componentes/CardTrajeto";
import { MapaViagem } from "../mapa/MapaViagem";
import { renderiza } from "./ajuda";

const agendado = { fase: "agendado", horarioAgendado: "2026-12-01T13:00:00Z", embarque: { lat: -18.9, lon: -48.27, label: "Av. Rondon Pacheco, 100 - Uberlândia" }, posicao: null, rota: null };

describe("Card do trajeto antes da saída", () => {
  it("sem etapas e com embarque: mostra a Saída com o endereço e o horário agendado", () => {
    const { container } = renderiza(<CardTrajeto dados={agendado} chegada={null} oculto={false} />);
    expect(container.querySelector("#c-trajeto")).not.toHaveAttribute("hidden");
    expect(screen.getByText("Saída")).toBeInTheDocument();
    expect(screen.getByText(/Rondon Pacheco/)).toBeInTheDocument();
    expect(container.querySelector(".p-h b")).toBeTruthy();
    expect(screen.getByText("Agendado")).toBeInTheDocument();
  });
  it("sem etapas e sem embarque: continua oculto", () => {
    const { container } = renderiza(<CardTrajeto dados={{ fase: "agendado" }} chegada={null} oculto={false} />);
    expect(container.querySelector("#c-trajeto")).toHaveAttribute("hidden");
  });
});

// MapLibre falso: guarda as chamadas de enquadramento para provar que o centro não depende do tamanho da tela.
const chamadas: any[] = [];
const marcadores: any[] = [];
vi.mock("maplibre-gl", () => {
  class Map {
    touchZoomRotate = { disableRotation() {} };
    constructor(public o: any) {}
    on() {} once() {} addControl() {} resize() {} remove() {} getSource() { return { setData() {} }; }
    easeTo(a: any) { chamadas.push({ tipo: "easeTo", ...a }); }
    fitBounds(b: any, a: any) { chamadas.push({ tipo: "fitBounds", b, ...a }); }
  }
  class Marker {
    ll: [number, number] = [0, 0]; el: any;
    constructor(o: any) { this.el = o.element; marcadores.push(this); }
    setLngLat(c: [number, number]) { this.ll = c; return this; }
    addTo() { return this; } remove() {}
    getLngLat() { return { toArray: () => this.ll }; } getElement() { return this.el; }
  }
  class LngLatBounds { constructor(public a: any, public b: any) {} extend() { return this; } }
  return { default: { Map, Marker, LngLatBounds, NavigationControl: class {}, setWorkerUrl() {} } };
});
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?url", () => ({ default: "w.mjs" }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

describe("Mapa antes da saída", () => {
  beforeEach(() => { chamadas.length = 0; marcadores.length = 0; });
  const op = (desktop: boolean) => ({ container: document.createElement("div"), caixa: document.createElement("div"), tomtom: false, desktop, debug: false, reduzMovimento: true, corRota: "#000", rotuloVeiculo: "Carro", rotuloEtapa: (n: number) => "Parada " + n, aoMexer() {}, aoSeguir() {}, aoMostrarCard() {}, aoDiagnostico() {} });

  // Os dados podem chegar antes ou depois de o mapa ser criado (o celular e o desktop carregam em tempos diferentes): o resultado é o mesmo.
  for (const [nome, desktop, antes] of [["celular, dados depois", false, false], ["desktop, dados depois", true, false], ["celular, dados antes", false, true], ["desktop, dados antes", true, true]] as const) {
    it("pino no embarque e centro fixo em zoom 15 (" + nome + ")", async () => {
      const m = await MapaViagem.criar(op(desktop), antes ? agendado : null);
      if (!antes) m.atualizar(agendado);
      expect(marcadores).toHaveLength(1);
      expect(marcadores[0].ll).toEqual([-48.27, -18.9]);
      const ultima = chamadas[chamadas.length - 1];
      expect(ultima).toMatchObject({ tipo: "easeTo", center: [-48.27, -18.9], zoom: 15 });
    });
  }
});
