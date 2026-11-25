import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardMotorista } from "../componentes/CardMotorista";
import type { Cfg } from "../tipos";
import { renderiza } from "./ajuda";

const cfg: Cfg = { tomtom: false, telefone: null, whatsapp: null, aoVivo: false, vapid: null, completo: true };
const abrir = () => {};

describe("Card do motorista sem escala", () => {
  it("em definição: mostra o aviso e esconde carro e placa", () => {
    const { container } = renderiza(<CardMotorista dados={{ fase: "agendado", rastreio: false, emDefinicao: true }} cfg={cfg} oculto={false} abrirTela={abrir} />);
    expect(screen.getByText("Motorista em definição")).toBeInTheDocument();
    expect(container.querySelector("#m-placa")).toBeNull();
    expect(container.querySelector("#abrir-motorista")).toBeNull();
  });
  it("sem rastreio com motorista: card normal com nome e placa", () => {
    renderiza(<CardMotorista dados={{ fase: "agendado", rastreio: false, emDefinicao: false, motorista: { nome: "Ana" }, veiculo: { placa: "TER1A23" } }} cfg={cfg} oculto={false} abrirTela={abrir} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("TER1A23")).toBeInTheDocument();
    expect(screen.queryByText("Motorista em definição")).toBeNull();
  });
  it("sino: em definição avisa quando o motorista for definido; com motorista, quando estiver chegando", () => {
    const comSino = { ...cfg, vapid: "BAAA" };
    const { container, unmount } = renderiza(<CardMotorista dados={{ fase: "agendado", rastreio: false, emDefinicao: true }} cfg={comSino} oculto={false} abrirTela={abrir} />);
    expect(container.querySelector("#sino-txt")?.textContent).toBe("Avisar quando o motorista for definido");
    unmount();
    const outro = renderiza(<CardMotorista dados={{ fase: "agendado", rastreio: false, emDefinicao: false, motorista: { nome: "Ana" }, veiculo: { placa: "TER1A23" } }} cfg={comSino} oculto={false} abrirTela={abrir} />);
    expect(outro.container.querySelector("#sino-txt")?.textContent).toBe("Avisar quando estiver chegando");
  });
});
