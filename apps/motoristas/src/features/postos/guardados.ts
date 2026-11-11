// Dados dos postos guardados no aparelho para abrir sem sinal, por motorista (aparelho compartilhado). Toda leitura e escrita tolera armazenamento bloqueado ou cheio.
import { guardadoValido } from "./postosProximos.ts";

const chaveDe = (motoristaId: string, chave: string) => `app-motoristas-postos:${motoristaId}:${chave}`;
export type Guardado<T> = { salvoEm: number; dados: T };

export function guardar<T>(motoristaId: string, chave: string, dados: T) {
  if (!motoristaId) return;
  try { localStorage.setItem(chaveDe(motoristaId, chave), JSON.stringify({ salvoEm: Date.now(), dados })); } catch { /* Sem armazenamento, só não há o que mostrar sem sinal. */ }
}

/** Dados guardados e ainda válidos (7 dias); formato inesperado ou vencido vira null. */
export function lerGuardado<T>(motoristaId: string, chave: string, valido: (dados: unknown) => boolean = Array.isArray): Guardado<T> | null {
  if (!motoristaId) return null;
  try {
    const bruto = localStorage.getItem(chaveDe(motoristaId, chave));
    const lido = bruto ? JSON.parse(bruto) as Partial<Guardado<T>> : null;
    return lido && typeof lido.salvoEm === "number" && guardadoValido(lido.salvoEm, Date.now()) && valido(lido.dados) ? lido as Guardado<T> : null;
  } catch { return null; }
}
