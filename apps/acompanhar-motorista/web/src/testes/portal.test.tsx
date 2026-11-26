import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Faixa } from "../componentes/Faixa";
import { LinhaDoTempo } from "../componentes/LinhaDoTempo";
import { fazTraduz } from "../i18n";
import { ehAeroporto, estadoViagem, fraseFase, linhaDoTempo, segmentosAcesos, sinoNoPasso, tituloFase } from "../portal";
import type { Dados } from "../tipos";
import { renderiza } from "./ajuda";

const t = fazTraduz("pt");
const cor = (c?: string) => c ?? "";
const vazio = { eta: null, chegada: null };
const ag = "2026-12-01T13:00:00Z";
const chaves = (d: Dados, c: number | null = null) => linhaDoTempo(d, c).map((p) => `${p.chave}:${p.estado}`);

describe("aeroporto", () => {
  it("reconhece aeroporto, siglas e terminal; rejeita endereço comum", () => {
    for (const x of ["Aeroporto Internacional de Guarulhos · Terminal 2", "GRU", "Congonhas", "Viracopos"]) expect(ehAeroporto(x), x).toBe(true);
    for (const x of ["Av. Paulista, 1000", "Rua Gruta, 5", "", null]) expect(ehAeroporto(x as string), String(x)).toBe(false);
  });
});

describe("fases, título e barra", () => {
  const casos: [Dados, string, string, number][] = [
    [{ fase: "agendado", emDefinicao: true }, "definicao", "Reserva confirmada", 1],
    [{ fase: "agendado", motorista: { nome: "Ana" } }, "agendado", "Motorista definido", 2],
    [{ fase: "a_caminho" }, "a_caminho", "Seu motorista está a caminho", 3],
    [{ fase: "no_local" }, "no_local", "Seu motorista chegou", 4],
    [{ fase: "em_viagem" }, "em_viagem", "Viagem em andamento", 5],
    [{ fase: "concluido" }, "concluido", "", 5],
  ];
  it.each(casos)("%j", (d, estado, titulo, acesos) => {
    expect(estadoViagem(d)).toBe(estado);
    if (titulo) expect(tituloFase(d, t)).toBe(titulo);
    expect(segmentosAcesos(d)).toBe(acesos);
  });
  it("aeroporto no local: título com o primeiro nome e sem frase repetida", () => {
    const d: Dados = { fase: "no_local", motorista: { nome: "Carlos Silva" }, embarque: { lat: 0, lon: 0, label: "Aeroporto de Guarulhos" } };
    expect(tituloFase(d, t)).toBe("Carlos espera você no desembarque");
    expect(fraseFase(d, { t, id: "pt", cor, eta: vazio, espera: 0 })).toBe("");
    const semNome: Dados = { ...d, motorista: undefined };
    expect(fraseFase(semNome, { t, id: "pt", cor, eta: vazio, espera: 0 })).toBe("Seu motorista espera você no desembarque.");
  });
});

describe("frase de previsão", () => {
  const d: Dados = { fase: "a_caminho", horarioAgendado: ag, embarque: { lat: 0, lon: 0, label: "Av. Rondon Pacheco, 100" } };
  const eta = (min: number) => ({ eta: { minutos: min } as never, chegada: Date.parse(ag) - 10 * 60000 });
  it("com ETA e horário agendado: mostra a diferença", () => {
    expect(fraseFase(d, { t, id: "pt", cor, eta: eta(5), espera: 0 })).toMatch(/10 min antes do horário/);
  });
  it("sem ETA: previsão indisponível", () => {
    expect(fraseFase(d, { t, id: "pt", cor, eta: vazio, espera: 0 })).toMatch(/indisponível/);
  });
});

describe("linha do tempo", () => {
  it("em definição", () => expect(chaves({ fase: "agendado", emDefinicao: true, horarioAgendado: ag })).toEqual(["confirmada:feita", "definicao:atual", "aguardando:futura", "a_caminho:futura", "no_local:futura", "em_viagem:futura", "chegada:futura"]));
  it("agendado: aguardando a saída é a etapa atual", () => expect(chaves({ fase: "agendado", horarioAgendado: ag })).toEqual(["confirmada:feita", "definido:feita", "aguardando:atual", "a_caminho:futura", "no_local:futura", "em_viagem:futura", "chegada:futura"]));
  it("a caminho", () => expect(chaves({ fase: "a_caminho" })).toEqual(["confirmada:feita", "definido:feita", "a_caminho:atual", "no_local:futura", "em_viagem:futura", "chegada:futura"]));
  it("no local", () => expect(chaves({ fase: "no_local" })).toEqual(["confirmada:feita", "definido:feita", "a_caminho:feita", "no_local:atual", "em_viagem:futura", "chegada:futura"]));
  it("em viagem com paradas", () => {
    const d: Dados = { fase: "em_viagem", etapas: [{ tipo: "embarque", rotulo: "A" }, { tipo: "parada", rotulo: "B", visitada: true }, { tipo: "parada", rotulo: "C", atual: true }, { tipo: "destino", rotulo: "D" }] } as Dados;
    expect(chaves(d)).toEqual(["confirmada:feita", "definido:feita", "a_caminho:feita", "no_local:feita", "em_viagem:feita", "parada:feita", "parada:atual", "chegada:futura"]);
  });
  it("concluído: tudo feito", () => expect(chaves({ fase: "concluido" }).every((x) => x.endsWith(":feita"))).toBe(true));
  it("sem rastreio: linha curta", () => expect(chaves({ fase: "agendado", rastreio: false, horarioAgendado: ag })).toEqual(["confirmada:feita", "definido:feita", "embarque:atual", "chegada:futura"]));
  it("o sino só aparece na etapa atual antes do embarque", () => {
    expect(sinoNoPasso({ chave: "a_caminho", estado: "atual" })).toBe(true);
    expect(sinoNoPasso({ chave: "aguardando", estado: "atual" })).toBe(true);
    expect(sinoNoPasso({ chave: "no_local", estado: "atual" })).toBe(false);
    expect(sinoNoPasso({ chave: "a_caminho", estado: "feita" })).toBe(false);
  });
});

describe("Faixa e LinhaDoTempo renderizadas", () => {
  it("faixa: saudação traduzida pelo idioma; concluído não mostra", () => {
    const d: Dados = { fase: "agendado", motorista: { nome: "Ana" }, embarque: { lat: 0, lon: 0, label: "Aeroporto de Guarulhos" } };
    const { container } = renderiza(<Faixa dados={d} eta={vazio} reserva={null} espera={0} />, "en");
    expect(container.querySelector("#boasvindas")).toHaveTextContent("Welcome");
    const fim = renderiza(<Faixa dados={{ ...d, fase: "concluido" }} eta={vazio} reserva={null} espera={0} />);
    expect(fim.container.querySelector("#boasvindas")).toBeNull();
  });
  it("faixa: título, 5 segmentos e selo com minutos só a caminho", () => {
    const d: Dados = { fase: "a_caminho", horarioAgendado: ag };
    const { container } = renderiza(<Faixa dados={d} eta={{ eta: { minutos: 7 } as never, chegada: Date.now() + 7 * 60000 }} reserva="Reserva OS-12" espera={0} />);
    expect(container.querySelector("#status")).toHaveTextContent("Seu motorista está a caminho");
    expect(container.querySelectorAll("#passos li")).toHaveLength(5);
    expect(container.querySelectorAll("#passos li.feita, #passos li.atual")).toHaveLength(3);
    expect(container.querySelector("#eta")).toHaveTextContent("7");
    expect(container.querySelector("#reserva")).toHaveTextContent("Reserva OS-12");
    expect(container.querySelector("#boasvindas")).toBeNull();
  });
  it("faixa: aeroporto mostra o boas-vindas e agendado não tem selo", () => {
    const d: Dados = { fase: "agendado", motorista: { nome: "Ana" }, embarque: { lat: 0, lon: 0, label: "Aeroporto de Guarulhos" } };
    const { container } = renderiza(<Faixa dados={d} eta={vazio} reserva={null} espera={0} />);
    expect(container.querySelector("#boasvindas")).toHaveTextContent("Seja bem-vindo");
    expect(container.querySelector("#eta")).toBeNull();
  });
  it("linha do tempo: etapa atual marcada, sem sino sem VAPID", () => {
    const { container } = renderiza(<LinhaDoTempo dados={{ fase: "a_caminho" }} cfg={{ tomtom: false, telefone: null, whatsapp: null, aoVivo: false, vapid: null, completo: false }} chegada={null} abrirTela={() => {}} />);
    expect(container.querySelectorAll("li.etapa")).toHaveLength(6);
    expect(container.querySelector("li.etapa[aria-current='step']")).toHaveAttribute("data-passo", "a_caminho");
    expect(screen.queryByRole("button", { name: /avis/i })).toBeNull();
  });
});
