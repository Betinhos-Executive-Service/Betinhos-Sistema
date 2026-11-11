// Dados dos postos guardados no aparelho para abrir sem sinal. Toda leitura e escrita tolera armazenamento bloqueado ou cheio.
import { guardadoValido } from "./postosProximos.ts";

const PREFIXO = "app-motoristas-postos:";
export type Guardado<T> = { salvoEm: number; dados: T };

export function guardar<T>(chave: string, dados: T) {
  try { localStorage.setItem(PREFIXO + chave, JSON.stringify({ salvoEm: Date.now(), dados })); } catch { /* Sem armazenamento, só não há o que mostrar sem sinal. */ }
}

/** Dados guardados e ainda válidos (7 dias); formato inesperado ou vencido vira null. */
export function lerGuardado<T>(chave: string, valido: (dados: unknown) => boolean = Array.isArray): Guardado<T> | null {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    const lido = bruto ? JSON.parse(bruto) as Partial<Guardado<T>> : null;
    return lido && typeof lido.salvoEm === "number" && guardadoValido(lido.salvoEm, Date.now()) && valido(lido.dados) ? lido as Guardado<T> : null;
  } catch { return null; }
}
