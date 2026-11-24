import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BYTES_MAX, LADO_MAX, LADO_MINI } from "../passageiros/foto";
import { CardPassageiros } from "../passageiros/CardPassageiros";
import { FolhaPassageiro } from "../passageiros/FolhaPassageiro";
import { faltasDe, type Passageiro } from "../passageiros/usePassageiros";
import { renderiza } from "./ajuda";

const ana: Passageiro = { id: "p1", primeiroNome: "Ana", temFoto: false, temTelefone: false, temEmail: true, emailMascarado: "a***@x.com" };
const completo: Passageiro = { id: "p2", primeiroNome: "Bia", temFoto: true, temTelefone: true, temEmail: true };
const lista = (aberto: boolean, ps = [ana, completo], visivel = true) =>
  <CardPassageiros lista={ps} aberto={aberto} visivel={visivel} versaoFoto={{}} salvo={null} limparSalvo={() => {}} editar={() => {}} />;

beforeEach(() => { history.replaceState(null, "", "/r/aB3dE5gH7jK8"); });
afterEach(() => vi.restoreAllMocks());

describe("Seção de passageiros", () => {
  it("escondida até a rota responder ou sem lista; com lista mostra título e um botão por pessoa", () => {
    const { container, rerender } = renderiza(lista(true, [ana, completo], false));
    expect(container.querySelector("#pax")).toHaveAttribute("hidden");
    rerender(lista(true, []));
    expect(container.querySelector("#pax")).toHaveAttribute("hidden");
    rerender(lista(true));
    expect(container.querySelector("#pax")).not.toHaveAttribute("hidden");
    expect(screen.getByText("Passageiros")).toBeInTheDocument();
    expect(screen.getByLabelText("Editar dados de Ana")).toBeInTheDocument();
  });
  it("tags 'Falta ...' só para o que falta e só com o cadastro aberto", () => {
    expect(faltasDe(ana)).toEqual(["pax.falta.foto", "pax.falta.telefone"]);
    const { rerender } = renderiza(lista(true));
    expect(screen.getByText("Falta foto")).toBeInTheDocument();
    expect(screen.getByText("Falta telefone")).toBeInTheDocument();
    expect(screen.queryByText("Falta e-mail")).toBeNull();
    rerender(lista(false));
  });
  it("cadastro encerrado: nota visível, linhas sem botão e sem tags", () => {
    const { container } = renderiza(lista(false));
    expect(screen.getByText("Cadastro encerrado para este serviço")).not.toHaveAttribute("hidden");
    expect(container.querySelectorAll("button.pax-btn")).toHaveLength(0);
    expect(screen.queryByText("Falta foto")).toBeNull();
  });
  it("dados do passageiro entram como texto, nunca como HTML", () => {
    const { container } = renderiza(lista(true, [{ ...ana, primeiroNome: "<img src=x onerror=alert(1)>" }]));
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });
});

describe("Folha de edição", () => {
  const abre = (salvar = vi.fn().mockResolvedValue(undefined), fechar = vi.fn()) => {
    const r = renderiza(<FolhaPassageiro editando={ana} versaoFoto={{}} salvar={salvar} fechar={fechar} />);
    return { ...r, salvar, fechar };
  };
  it("câmera com capture=\"user\" e galeria sem capture; foco no nome ao abrir", () => {
    const { container } = abre();
    expect(container.querySelector("#pf-arq-camera")).toHaveAttribute("capture", "user");
    expect(container.querySelector("#pf-arq-galeria")).not.toHaveAttribute("capture");
    expect(container.querySelector("#pf-nome")).toHaveFocus();
    expect(container.querySelector("#pf-salvar")).toBeDisabled();
    for (const id of ["pf", "pf-fechar", "pf-camera", "pf-galeria", "pf-tel", "pf-email", "pf-erro", "pf-salvar"]) expect(container.querySelector("#" + id), id).not.toBeNull();
  });
  it("mostra o valor atual mascarado e valida telefone e e-mail antes de enviar", () => {
    const { container, salvar } = abre();
    expect(container.querySelector("#pf-email-atual")).toHaveTextContent("Atual: a***@x.com");
    fireEvent.change(container.querySelector("#pf-tel")!, { target: { value: "123" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(container.querySelector("#pf-erro")).toHaveTextContent("Telefone inválido");
    fireEvent.change(container.querySelector("#pf-tel")!, { target: { value: "" } });
    fireEvent.change(container.querySelector("#pf-email")!, { target: { value: "sem-arroba" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(container.querySelector("#pf-erro")).toHaveTextContent("E-mail inválido");
    expect(salvar).not.toHaveBeenCalled();
  });
  it("envia só o que foi preenchido, com telefone no formato do envio, e fecha ao salvar", async () => {
    const { container, salvar, fechar } = abre();
    fireEvent.change(container.querySelector("#pf-tel")!, { target: { value: "(12) 99723-6961" } });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    expect(salvar).toHaveBeenCalledTimes(1);
    const [id, corpo] = salvar.mock.calls[0];
    expect(id).toBe("p1");
    expect(Object.keys(corpo)).toEqual(["telefone"]);
    expect(String(corpo.telefone).replace(/\D/g, "")).toMatch(/12997236961$/);
  });
  it("falha de rede mantém a folha aberta com os dados digitados e a mensagem de rede", async () => {
    const { container, fechar } = abre(vi.fn().mockRejectedValue(new Error("rede")));
    fireEvent.change(container.querySelector("#pf-email")!, { target: { value: "ana@exemplo.com" } });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(container.querySelector("#pf-erro")).toHaveTextContent("Não foi possível salvar agora"));
    expect(fechar).not.toHaveBeenCalled();
    expect(container.querySelector("#pf-email")).toHaveValue("ana@exemplo.com");
  });
  it("Esc e X: sem alteração fecha; com alteração pede 'Descartar alterações?' e Esc de novo continua editando", async () => {
    const { container, fechar } = abre();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(fechar).toHaveBeenCalledTimes(1);
    fireEvent.change(container.querySelector("#pf-email")!, { target: { value: "a@b.co" } });
    fireEvent.click(container.querySelector("#pf-fechar")!);
    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    expect(fechar).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Descartar alterações?")).toBeNull());
    expect(container.querySelector("#pf-email")).toHaveValue("a@b.co");
    fireEvent.click(container.querySelector("#pf-fechar")!);
    fireEvent.click(await screen.findByText("Descartar"));
    expect(fechar).toHaveBeenCalledTimes(2);
  });
  it("clique fora fecha pelo mesmo caminho (confirma quando há alteração)", async () => {
    const { container, fechar } = abre();
    fireEvent.change(container.querySelector("#pf-tel")!, { target: { value: "1" } });
    fireEvent.click(container.querySelector("#pf")!);
    expect(await screen.findByText("Continuar editando")).toBeInTheDocument();
    expect(fechar).not.toHaveBeenCalled();
  });
});

describe("Foto do passageiro", () => {
  it("limites: lado maior 1280 px, miniatura 288 px e até 2,5 MB (base64 cabe no corpo de 4 MB do Worker)", () => {
    expect(LADO_MAX).toBe(1280);
    expect(LADO_MINI).toBe(288);
    expect(BYTES_MAX).toBe(2.5 * 1024 * 1024);
    expect(Math.ceil((BYTES_MAX * 4) / 3) + 40_000).toBeLessThan(4 * 1024 * 1024);
  });
  it("arquivo que não abre mostra o erro de arquivo e não habilita o Salvar", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("x")));
    const { container } = renderiza(<FolhaPassageiro editando={ana} versaoFoto={{}} salvar={vi.fn()} fechar={vi.fn()} />);
    const arq = new File(["x"], "a.heic", { type: "image/heic" });
    await act(async () => { fireEvent.change(container.querySelector("#pf-arq-galeria")!, { target: { files: [arq] } }); });
    await waitFor(() => expect(container.querySelector("#pf-erro")).not.toHaveAttribute("hidden"));
    expect(container.querySelector("#pf-salvar")).toBeDisabled();
    vi.unstubAllGlobals();
  });
});
