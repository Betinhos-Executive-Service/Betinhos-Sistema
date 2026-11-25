import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IDIOMAS, TEXTOS } from "../../../src/idiomas.mjs";
import { CardCompartilhar } from "../componentes/CardCompartilhar";
import { SeletorIdioma } from "../componentes/SeletorIdioma";
import { LinkInvalido } from "../componentes/LinkInvalido";
import { renderiza } from "./ajuda";

const arquivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|)$/.test(p) && !/\.test\./.test(p) && /\.tsx?$/.test(p) ? [p] : []; });

describe("idioma", () => {
  it("seletor com as três bandeiras; trocar muda o texto e o <html lang> do menu", () => {
    const { container } = renderiza(<><SeletorIdioma segmentado /><CardCompartilhar /></>);
    expect(container.querySelector("#idioma")).not.toBeNull();
    for (const l of IDIOMAS) expect(container.querySelector(`[data-idioma="${l.id}"]`)).not.toBeNull();
    expect(screen.getByLabelText("Compartilhar este link")).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-idioma="en"]')!);
    expect(screen.getByLabelText("Share this link")).toBeInTheDocument();
  });
  it("link inválido tem seletor de idioma, texto próprio e nenhum mapa", () => {
    for (const [estado, pt] of [["revogado", "Acompanhamento encerrado"], ["expirado", "Link expirado"]] as const) {
      const { container, unmount } = renderiza(<LinkInvalido estado={estado} />);
      expect(container.querySelector("#idioma-botao")).not.toBeNull();
      expect(screen.getByText(pt)).toBeInTheDocument();
      expect(container.querySelector(".maplibregl-map, #mapa, canvas")).toBeNull();
      unmount();
    }
  });
  it("dicionário completo e toda chave usada nos componentes existe", () => {
    for (const [k, l] of Object.entries(TEXTOS) as [string, string[]][]) { expect(l.length, k).toBe(IDIOMAS.length); l.forEach((s, i) => expect(s, `${k}[${i}]`).toBeTruthy()); }
    const usadas = new Set<string>();
    for (const f of arquivos("web/src")) for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"([a-z][\w.]*)"/g)) usadas.add(m[1]);
    expect(usadas.size).toBeGreaterThan(60);
    for (const k of usadas) if (!k.endsWith(".")) expect((TEXTOS as Record<string, unknown>)[k], `chave ausente: ${k}`).toBeTruthy();
  });
});
