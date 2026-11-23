// Nota guardada no aparelho: a Infleet leva uns 3 s e a nota muda pouco ao longo do dia.
// Molde de features/termos/minhasMultasOffline.ts: o cache é do usuário que salvou e falha de armazenamento é ignorada.
import { obterArmazem } from "../termos/minhasMultasOffline.ts";
import type { NotaInfleet } from "./notaInfleet.ts";

export const NOTA_CACHE_KEY = "app-motoristas-nota-infleet-v1";
export const NOTA_CACHE_VALIDADE_MS = 60 * 60 * 1000;

type Registro = { salvoEm: string; usuario: string; nota: NotaInfleet };

export function salvarNotaCache(usuario: string, nota: NotaInfleet, armazem = obterArmazem(), agora = new Date()) {
  try {
    const registro: Registro = { salvoEm: agora.toISOString(), usuario, nota };
    armazem?.setItem(NOTA_CACHE_KEY, JSON.stringify(registro));
  } catch {
    // Sem espaço ou armazenamento bloqueado: a nota vem sempre da Infleet.
  }
}

// Cache gravado por outra versão do app não pode quebrar a tela: confere o formato que ela lê.
function formatoValido(nota: NotaInfleet | undefined): boolean {
  if (nota?.situacao === "sem_cadastro") return true;
  if (nota?.situacao !== "ok" && nota?.situacao !== "em_formacao") return false;
  return Array.isArray(nota.comportamentos) && Array.isArray(nota.meses) && typeof nota.km === "number" && (nota.situacao !== "ok" || typeof nota.nota === "number");
}

export function limparNotaCache(armazem = obterArmazem()) {
  try {
    armazem?.removeItem(NOTA_CACHE_KEY);
  } catch {
    // Armazenamento bloqueado: nada a limpar.
  }
}

// `fresca` = dentro da validade; vencida ainda aparece enquanto a nova carrega.
export function lerNotaCache(usuario: string, armazem = obterArmazem(), agora = new Date()): { nota: NotaInfleet; fresca: boolean } | null {
  try {
    const bruto = armazem?.getItem(NOTA_CACHE_KEY);
    if (!bruto) return null;
    const registro = JSON.parse(bruto) as Registro;
    const salvoEm = new Date(registro.salvoEm).getTime();
    if (!formatoValido(registro.nota) || Number.isNaN(salvoEm)) return null;
    if (usuario && registro.usuario && registro.usuario !== usuario) {
      armazem?.removeItem(NOTA_CACHE_KEY);
      return null;
    }
    return { nota: registro.nota, fresca: agora.getTime() - salvoEm < NOTA_CACHE_VALIDADE_MS };
  } catch {
    return null;
  }
}
