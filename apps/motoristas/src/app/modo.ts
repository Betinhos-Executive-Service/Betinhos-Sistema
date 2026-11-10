// "motorista": web resource no Dynamics (motoristas Betinhos e terceiros fixos).
// "link": parceiro esporádico que abre o link do repasse, servido pelo Worker (parte 3; ainda inalcançável).
export type Modo = "motorista" | "link";

export function detectarModo(): Modo {
  return "motorista";
}
