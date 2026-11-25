import { readFileSync } from "node:fs";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardStatus } from "../componentes/CardStatus";
import { CardTrajeto } from "../componentes/CardTrajeto";
import type { Cfg, Dados } from "../tipos";
import { renderiza } from "./ajuda";

const cfg: Cfg = { tomtom: false, telefone: null, whatsapp: null, aoVivo: false, vapid: null, completo: true };
const semEta = { eta: null, chegada: null };
const status = (d: Dados | null, extra: Partial<Parameters<typeof CardStatus>[0]> = {}, c: Cfg = cfg) =>
  renderiza(<CardStatus dados={d} cfg={c} eta={semEta} idade={0} desvio={0} agora={Date.now()} titulo={null} {...extra} />);

describe("Card de status", () => {
  it("esqueleto do ETA só no modo completo (o painel não salta no primeiro paint)", () => {
    for (const completo of [true, false]) {
      const { container } = status(null, {}, { ...cfg, completo });
      expect(container.querySelector("#eta")?.hasAttribute("hidden")).toBe(!completo);
    }
  });

  it("chegou: faixa com tempo de espera a partir do marco de chegada", () => {
    const agora = Date.now();
    const d: Dados = { fase: "no_local", posicao: { lat: 1, lon: 1 }, marcos: { chegouEmbarqueEm: new Date(agora - 4 * 60000).toISOString() }, veiculo: { modelo: "Corolla", placa: "ABC1D23" } };
    const { container } = status(d, { agora });
    expect(container.querySelector("#painel")).toHaveClass("chegou");
    expect(container.querySelector("#aviso")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#aviso-espera")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#aviso-espera")?.textContent).toMatch(/4/);
    expect(container.querySelector("#aviso-texto")?.textContent).toMatch(/ABC1D23/);
  });

  it("concluído: resumo com saída, chegada e duração, sem passos nem ETA", () => {
    const d: Dados = { fase: "concluido", marcos: { saiuEmbarqueEm: "2026-11-24T12:00:00Z", concluidoEm: "2026-11-24T12:42:00Z" } };
    const { container } = status(d);
    expect(container.querySelector("#concluido")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#resumo")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#r-duracao")?.textContent).toBe("42 min");
    expect(container.querySelector("#passos")).toHaveAttribute("hidden");
    expect(container.querySelector("#avaliacao")).not.toHaveAttribute("hidden");
  });

  it("viagem agendada: texto com dia e hora de Brasília, sem passos", () => {
    const d: Dados = { fase: "agendado", horarioAgendado: "2026-11-25T15:30:00Z" };
    const { container } = status(d);
    expect(container.querySelector("#agendado")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#agendado-txt")?.textContent).toContain("25/11");
    expect(container.querySelector("#agendado-txt")?.textContent).toContain("12:30");
    expect(container.querySelector("#passos")).toHaveAttribute("hidden");
  });

  it("passos: o atual e os anteriores ficam marcados para o e2e e para leitor de tela", () => {
    const { container } = status({ fase: "em_viagem" });
    expect(container.querySelector('[data-passo="em_viagem"]')).toHaveAttribute("aria-current", "step");
    expect(container.querySelector('[data-passo="a_caminho"]')).toHaveClass("feita");
  });
});

describe("Card do trajeto", () => {
  const etapas = [{ tipo: "saida", rotulo: "Hotel" }, { tipo: "destino", rotulo: "Aeroporto" }];
  it("escondido sem etapas; com etapas, saída mostra o agendado e o destino o previsto", () => {
    const { container, rerender } = renderiza(<CardTrajeto dados={{ fase: "a_caminho" }} chegada={null} oculto={false} />);
    expect(container.querySelector("#c-trajeto")).toHaveAttribute("hidden");
    rerender(<CardTrajeto dados={{ fase: "a_caminho", etapas, horarioAgendado: "2026-11-24T15:30:00Z" }} chegada={Date.parse("2026-11-24T16:10:00Z")} oculto={false} />);
    expect(container.querySelectorAll("#paradas li")).toHaveLength(2);
    expect(screen.getByText("Agendado")).toBeInTheDocument();
    expect(screen.getByText("Previsto")).toBeInTheDocument();
    expect(container.querySelector("#c-trajeto")).not.toHaveAttribute("hidden");
  });
  it("lista vertical, sem trilho colorido nem borda lateral", () => {
    const css = readFileSync("web/src/estilo.css", "utf8");
    expect(css).not.toMatch(/\.trilho/);
    expect(css).not.toMatch(/border-left:\s*\d+px solid var\(--bt-color-(brand|action|success)/);
  });
});
