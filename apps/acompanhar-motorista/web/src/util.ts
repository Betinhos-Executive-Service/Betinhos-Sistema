import type { Cfg } from "./tipos";

export const iniciais = (n?: string) => (n || "?").trim().charAt(0).toUpperCase();
// Telefone sem o prefixo 55 (formato do cadastro da Infleet).
export function digitos(x: unknown) {
  let s = String(x || "").replace(/\D/g, "");
  if (s.length >= 12 && s.startsWith("55")) s = s.slice(2);
  return s;
}
// Rótulo antigo pode vir como "13:40 - FELIPE - Rua X, 100 - Bairro": mostra só a parte que é endereço.
export function enderecoLimpo(label?: string) {
  const s = String(label || "").split(/\r?\n/)[0].replace(/^\d+\.\s*/, "").replace(/^\d{1,2}:\d{2}\s*-\s*/, "").trim();
  const partes = s.split(/\s+-\s+/);
  let i = 0;
  while (i < partes.length - 1 && !/\d/.test(partes[i]) && !/^(rua|r\.|av|avenida|alameda|al\.|estrada|rodovia|rod\.|praça|travessa|aerop|aeroporto|hotel|shopping)/i.test(partes[i])) i++;
  return partes.slice(i).join(" - ");
}
// "Chevrolet Cruze": marca + modelo quando couber; se cortar, só o modelo.
export function nomesCarro(v: { marca?: string; modelo?: string }) {
  let marca = (v.marca || "").trim(), modelo = (v.modelo || "").trim();
  if (marca && marca === marca.toUpperCase()) marca = marca.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  const i = marca ? modelo.toLowerCase().indexOf(marca.toLowerCase()) : -1;
  if (i === 0) modelo = modelo.slice(marca.length).trim() || modelo;
  return { modelo, completo: !marca || i > 0 ? modelo : modelo ? `${marca} ${modelo}` : marca };
}
export function distanciaKm(c: [number, number][]) {
  let t = 0;
  const R = 6371, rad = Math.PI / 180;
  for (let i = 1; i < c.length; i++) {
    const dLat = (c[i][1] - c[i - 1][1]) * rad, dLon = (c[i][0] - c[i - 1][0]) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(c[i - 1][1] * rad) * Math.cos(c[i][1] * rad) * Math.sin(dLon / 2) ** 2;
    t += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return t;
}
export const linkLigar = (tel: string, cfg: Cfg) => (tel ? `tel:+55${tel}` : cfg.telefone ? `tel:${cfg.telefone}` : undefined);
export const linkWhats = (tel: string, cfg: Cfg) => (tel ? `https://wa.me/55${tel}` : digitos(cfg.whatsapp) ? `https://wa.me/55${digitos(cfg.whatsapp)}` : undefined);

// Foto do carro sem o fundo branco: o branco ligado às bordas vira transparente (o branco da lataria, no meio, fica).
const semFundo: Record<string, string> = {};
export function tirarFundoBranco(src: string): Promise<string | null> {
  if (semFundo[src]) return Promise.resolve(semFundo[src]);
  return new Promise((ok) => {
    const im = new Image();
    im.onload = () => {
      try {
        const esc = Math.min(1, 1100 / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(1, Math.round(im.naturalWidth * esc)), h = Math.max(1, Math.round(im.naturalHeight * esc));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d")!;
        g.drawImage(im, 0, 0, w, h);
        const px = g.getImageData(0, 0, w, h), d = px.data, vis = new Uint8Array(w * h), pilha: number[] = [];
        const branco = (i: number) => d[i + 3] < 8 || (d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 228);
        const semear = (x: number, y: number) => { const k = y * w + x; if (!vis[k] && branco(k * 4)) { vis[k] = 1; pilha.push(k); } };
        for (let x = 0; x < w; x++) { semear(x, 0); semear(x, h - 1); }
        for (let y = 0; y < h; y++) { semear(0, y); semear(w - 1, y); }
        while (pilha.length) {
          const k = pilha.pop()!, x0 = k % w, y0 = (k - x0) / w;
          d[k * 4 + 3] = 0;
          if (x0 > 0) semear(x0 - 1, y0);
          if (x0 < w - 1) semear(x0 + 1, y0);
          if (y0 > 0) semear(x0, y0 - 1);
          if (y0 < h - 1) semear(x0, y0 + 1);
        }
        g.putImageData(px, 0, 0);
        semFundo[src] = c.toDataURL("image/png");
      } catch { semFundo[src] = src; }
      ok(semFundo[src]);
    };
    im.onerror = () => ok(null);
    im.src = src;
  });
}
