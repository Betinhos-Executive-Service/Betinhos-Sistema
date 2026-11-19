// Nota guardada no aparelho: a Infleet leva uns 3 s e a nota muda pouco ao longo do dia.
// Molde de features/termos/minhasMultasOffline.ts: o cache é do usuário que salvou e falha de armazenamento é ignorada.
import type { NotaInfleet } from "./notaInfleet.ts";

export const NOTA_CACHE_KEY = "app-motoristas-nota-infleet-v1";
export const NOTA_CACHE_VALIDADE_MS = 6 * 60 * 60 * 1000;

type ArmazemTexto = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Registro = { salvoEm: string; usuario: string; nota: NotaInfleet };

function obterArmazem(): ArmazemTexto | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function salvarNotaCache(usuario: string, nota: NotaInfleet, armazem = obterArmazem(), agora = new Date()) {
  try {
    const registro: Registro = { salvoEm: agora.toISOString(), usuario, nota };
    armazem?.setItem(NOTA_CACHE_KEY, JSON.stringify(registro));
  } catch {
    // Sem espaço ou armazenamento bloqueado: a nota vem sempre da Infleet.
  }
}

// `fresca` = dentro da validade; vencida ainda aparece enquanto a nova carrega.
export function lerNotaCache(usuario: string, armazem = obterArmazem(), agora = new Date()): { nota: NotaInfleet; fresca: boolean } | null {
  try {
    const bruto = armazem?.getItem(NOTA_CACHE_KEY);
    if (!bruto) return null;
    const registro = JSON.parse(bruto) as Registro;
    const salvoEm = new Date(registro.salvoEm).getTime();
    if (!registro.nota?.situacao || Number.isNaN(salvoEm)) return null;
    if (usuario && registro.usuario && registro.usuario !== usuario) {
      armazem?.removeItem(NOTA_CACHE_KEY);
      return null;
    }
    return { nota: registro.nota, fresca: agora.getTime() - salvoEm < NOTA_CACHE_VALIDADE_MS };
  } catch {
    return null;
  }
}
