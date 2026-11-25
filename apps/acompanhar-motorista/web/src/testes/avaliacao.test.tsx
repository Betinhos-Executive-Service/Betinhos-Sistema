import { readFileSync } from "node:fs";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Avaliacao } from "../componentes/Avaliacao";
import { renderiza } from "./ajuda";

afterEach(() => vi.restoreAllMocks());

describe("Avaliação", () => {
  it("tem 5 estrelas com nome acessível, comentário até 1000 e fica escondida até concluir", () => {
    const { container, rerender } = renderiza(<Avaliacao visivel={false} avaliado={false} />);
    expect(container.querySelector("#avaliacao")).toHaveAttribute("hidden");
    for (let n = 1; n <= 5; n++) expect(container.querySelector(`[aria-label="Nota ${n} de 5"]`)).not.toBeNull();
    expect(container.querySelector("textarea")).toHaveAttribute("maxlength", "1000");
    expect(screen.getByText("Como foi o seu serviço?")).toBeInTheDocument();
    expect(screen.getByText("Enviar avaliação")).toBeInTheDocument();
    expect(screen.getByText("Obrigado pela avaliação")).toBeInTheDocument();
    rerender(<></>);
  });

  it("estrela tem alvo de toque de pelo menos 44 px no CSS", () => {
    const css = readFileSync("web/src/estilo.css", "utf8");
    expect(css).toMatch(/\.estrela\{[^}]*width:44px[^}]*height:44px/);
  });

  it("envia nota e comentário, e depois só mostra o agradecimento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderiza(<Avaliacao visivel avaliado={false} />);
    fireEvent.click(screen.getByLabelText("Nota 4 de 5"));
    fireEvent.change(container.querySelector("textarea")!, { target: { value: " Muito bom " } });
    fireEvent.click(screen.getByText("Enviar avaliação"));
    await waitFor(() => expect(container.querySelector("#av-obrigado")).not.toHaveAttribute("hidden"));
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo).toEqual({ nota: 4, comentario: "Muito bom" });
    expect(container.querySelector("#av-form")).toHaveAttribute("hidden");
  });

  it("serviço já avaliado mostra o agradecimento sem o formulário; o comentário nunca vira HTML", () => {
    const { container } = renderiza(<Avaliacao visivel avaliado />);
    expect(container.querySelector("#av-form")).toHaveAttribute("hidden");
    expect(container.querySelector("#av-obrigado")).not.toHaveAttribute("hidden");
    expect(readFileSync("web/src/componentes/Avaliacao.tsx", "utf8")).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
