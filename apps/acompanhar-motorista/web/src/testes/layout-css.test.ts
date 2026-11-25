import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("web/src/estilo.css", "utf8");
const html = readFileSync("web/portal.html", "utf8");

describe("contrato visual do portal (CSS e HTML do build)", () => {
  it("portal: 1 coluna no celular e 2 colunas com mapa fixo a partir de 900 px", () => {
    expect(css).toMatch(/\.col-a,\.col-b\{display:contents\}/);
    expect(css).toMatch(/@media \(min-width:900px\)/);
    expect(css).toMatch(/\.col-b\{display:block;position:sticky;top:16px/);
  });
  it("página rola como site comum: sem altura fixa de tela cheia no #app nem no body", () => {
    expect(css).not.toMatch(/#app\{[^}]*height:100dvh/);
    expect(css).not.toMatch(/html,body\{[^}]*height:100%/);
  });
  it("toque no celular: sem realce do navegador, :active próprio e body com ontouchstart (iOS)", () => {
    expect(css).toMatch(/html\{-webkit-tap-highlight-color:transparent\}/);
    expect(html).toMatch(/<body ontouchstart="">/);
    for (const sel of [".btn:active", ".qd:active", ".idioma-op:active", ".estrela:active", ".m-abrir:active"]) expect(css, sel).toContain(sel);
  });
  it("toast some por opacidade (sem atributo hidden) e respeita movimento reduzido", () => {
    expect(css).toMatch(/\.toast\{position:fixed;left:50%;bottom:calc\(24px/);
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\{\.toast\{transform:translateX\(-50%\)\}/);
  });
  it("sino com fundo do bloco do veículo; versão discreta que não captura clique", () => {
    expect(css).toMatch(/\.sino \.btn\{[^}]*background:var\(--bt-color-surface-muted,#f1f4f8\)/);
    expect(css).toMatch(/\.versao\{[^}]*pointer-events:none/);
  });
  it("animações CSS e movimento reduzido: rolo do ETA, selo e pulso do ao vivo", () => {
    for (const k of ["rolo-sai", "rolo-entra", "badge-sai", "badge-entra", "vivo-pulso"]) expect(css, k).toContain("@keyframes " + k);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
  it("o HTML do build mantém os marcadores que o Worker substitui e não pré-carrega o mapa", () => {
    expect(html).toContain("<!--BT_HEAD-->");
    expect(html).toContain("<!--BT_ROOT-->");
    expect(html).not.toMatch(/maplibre|openfreemap/i);
  });
});
