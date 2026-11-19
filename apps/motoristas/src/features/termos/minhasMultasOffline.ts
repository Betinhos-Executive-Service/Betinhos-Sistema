// Últimas multas do motorista guardadas no aparelho: sem rede a tela mostra essas, só para leitura, e avisa a hora da leitura.
// Molde de features/servicos/agendaOffline.ts: o cache é do usuário que salvou e qualquer falha de armazenamento é ignorada.
import { getCurrentUserId } from "../../data/dataverse/cliente.ts";
import type { MinhaMulta } from "./minhasMultas.ts";

export const MINHAS_MULTAS_OFFLINE_KEY = "app-motoristas-minhas-multas-v1";

type ArmazemTexto = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Registro = { salvoEm: string; usuario: string; itens: MinhaMulta[] };

export function usuarioAtual() {
  try {
    return getCurrentUserId();
  } catch {
    return "";
  }
}

function obterArmazem(): ArmazemTexto | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function salvarMinhasMultas(usuario: string, itens: MinhaMulta[], armazem: ArmazemTexto | undefined = obterArmazem(), agora = new Date()) {
  if (!armazem) return;
  try {
    const registro: Registro = { salvoEm: agora.toISOString(), usuario, itens };
    armazem.setItem(MINHAS_MULTAS_OFFLINE_KEY, JSON.stringify(registro));
  } catch {
    // Sem espaço ou armazenamento bloqueado: o app segue só online.
  }
}

export function lerMinhasMultas(usuario: string, armazem: ArmazemTexto | undefined = obterArmazem()): { salvoEm: string; itens: MinhaMulta[] } | null {
  if (!armazem) return null;
  try {
    const bruto = armazem.getItem(MINHAS_MULTAS_OFFLINE_KEY);
    if (!bruto) return null;
    const registro = JSON.parse(bruto) as Registro;
    if (!Array.isArray(registro.itens) || Number.isNaN(new Date(registro.salvoEm).getTime())) return null;
    // Só rejeita quando os dois usuários são conhecidos: offline em partida a frio o runtime ainda não sabe quem é.
    if (usuario && registro.usuario && registro.usuario !== usuario) {
      armazem.removeItem(MINHAS_MULTAS_OFFLINE_KEY);
      return null;
    }
    return { salvoEm: registro.salvoEm, itens: registro.itens };
  } catch {
    return null;
  }
}
