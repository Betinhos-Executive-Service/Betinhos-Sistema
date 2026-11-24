import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "../componentes/Foto";
import { renderiza } from "./ajuda";

const imagens: any[] = [];
beforeEach(() => {
  imagens.length = 0;
  vi.stubGlobal("Image", class { naturalWidth = 0; naturalHeight = 0; onload: (() => void) | null = null; src = ""; constructor() { imagens.push(this); } });
});
afterEach(() => vi.unstubAllGlobals());
const carrega = (img: any, w: number, h: number) => act(() => { img.naturalWidth = w; img.naturalHeight = h; img.onload?.(); });

describe("Avatar nunca vazio", () => {
  it("sem foto, mostra a inicial", () => {
    const { container } = renderiza(<Avatar src={undefined} inicial="C" className="av" />);
    expect(container.textContent).toBe("C");
  });
  it("inicial enquanto carrega; foto só depois de carregar de verdade", () => {
    const { container } = renderiza(<Avatar src="/f.jpg" inicial="C" className="av" />);
    expect(container.textContent).toBe("C");
    carrega(imagens.at(-1), 96, 96);
    expect(container.querySelector("img")).toHaveAttribute("src", "/f.jpg");
  });
  it("pixel 1x1 mantém a inicial", () => {
    const { container } = renderiza(<Avatar src="/pixel.jpg" inicial="C" className="av" />);
    carrega(imagens.at(-1), 1, 1);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("C");
  });
  it("erro de carregamento mantém a inicial", () => {
    const { container } = renderiza(<Avatar src="/404.jpg" inicial="C" className="av" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("foto antiga que chega depois da troca não substitui a nova inicial", () => {
    const { container, rerender } = renderiza(<Avatar src="/a.jpg" inicial="C" className="av" />);
    const antiga = imagens.at(-1);
    rerender(<Avatar src="/b.jpg" inicial="D" className="av" />);
    carrega(antiga, 96, 96);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("D");
  });
});
