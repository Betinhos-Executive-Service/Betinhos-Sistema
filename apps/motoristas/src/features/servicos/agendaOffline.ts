// Última agenda do motorista guardada no aparelho: sem rede o app abre com ela e avisa o horário da leitura.
// Guarda só serviços de hoje e amanhã (os que a carga remota já traz), sem concluídos nem histórico.
import type { AgendaItem } from "../../types.ts";
import type { DriverContext } from "../../data/dataverse/cliente.ts";
import { getCurrentUserId } from "../../data/dataverse/cliente.ts";
import { getAgendaItemStartDate } from "../../app/agendaVisibility.ts";

export const AGENDA_OFFLINE_KEY = "app-motoristas-agenda-offline-v1";

type Registro = Record<string, unknown>;
type ArmazemTexto = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AgendaOffline = {
  salvoEm: string;
  /** Usuário do Dataverse dono do cache: outro login no mesmo aparelho não vê a agenda alheia. */
  usuario: string;
  driver: DriverContext | null;
  agenda: AgendaItem[];
  /** Início de cada item em ms (por id), para refiltrar a janela na leitura. */
  inicios: Record<string, number>;
};

const inicioDoDia = (data: Date) => new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();

function paraMs(valor: unknown) {
  const ms = typeof valor === "string" ? new Date(valor).getTime() : NaN;
  return Number.isNaN(ms) ? null : ms;
}

/** Início do serviço: data do registro Dataverse; sem ela, o rótulo da agenda. */
export function inicioDoItem(item: AgendaItem, agora: number): number | null {
  const record = item.detail?.dataverse?.record as Registro | undefined;
  if (record) {
    const geral = (record.__geral as Registro | undefined) ?? record;
    const ms = paraMs(item.tipo === "TROCA" ? record.cr40f_iniciodajaneladetroca : geral.cr40f_dataehorriodesada);
    if (ms !== null) return ms;
  }
  return getAgendaItemStartDate(item, agora)?.getTime() ?? null;
}

/** Hoje e amanhã (fuso do aparelho); item sem data legível fica fora, para não guardar o que não dá para limpar. */
function dentroDaJanela(inicio: number | null, agora: Date) {
  if (inicio === null) return false;
  const hoje = inicioDoDia(agora);
  return inicio >= hoje && inicio < hoje + 2 * 24 * 60 * 60 * 1000;
}

function montar(agenda: AgendaItem[], inicios: Record<string, number>, agora: Date) {
  const mantidos = agenda.filter((item) => item.tipo === "HEADER" || dentroDaJanela(inicios[item.id] ?? null, agora));
  // Cabeçalho de data só enquanto houver item depois dele.
  return mantidos.filter((item, indice) => item.tipo !== "HEADER" || (mantidos[indice + 1] && mantidos[indice + 1].tipo !== "HEADER"));
}

export function salvarAgendaOffline(remote: { agenda: AgendaItem[]; driver: DriverContext | null }, agora = new Date(), armazem: ArmazemTexto | undefined = obterArmazem(), usuario = usuarioAtual()) {
  if (!armazem) return;
  const inicios: Record<string, number> = {};
  for (const item of remote.agenda) {
    if (item.tipo === "HEADER") continue;
    const inicio = inicioDoItem(item, agora.getTime());
    if (inicio !== null) inicios[item.id] = inicio;
  }
  const registro: AgendaOffline = { salvoEm: agora.toISOString(), usuario, driver: remote.driver, agenda: montar(remote.agenda, inicios, agora), inicios };
  registro.inicios = Object.fromEntries(Object.entries(inicios).filter(([id]) => registro.agenda.some((item) => item.id === id)));
  try {
    armazem.setItem(AGENDA_OFFLINE_KEY, JSON.stringify(registro));
  } catch {
    // Sem espaço ou armazenamento bloqueado: o app segue só online.
  }
}

export function lerAgendaOffline(agora = new Date(), armazem: ArmazemTexto | undefined = obterArmazem(), usuario = usuarioAtual()): AgendaOffline | null {
  if (!armazem) return null;
  try {
    const bruto = armazem.getItem(AGENDA_OFFLINE_KEY);
    if (!bruto) return null;
    const registro = JSON.parse(bruto) as AgendaOffline;
    if (!Array.isArray(registro.agenda) || !paraMs(registro.salvoEm)) return null;
    // Só rejeita quando os dois usuários são conhecidos: offline em partida a frio o runtime ainda não sabe quem é (WhoAmI exige rede).
    if (usuario && registro.usuario && registro.usuario !== usuario) {
      armazem.removeItem(AGENDA_OFFLINE_KEY);
      return null;
    }
    const inicios = registro.inicios ?? {};
    const agenda = montar(registro.agenda, inicios, agora);
    if (!agenda.some((item) => item.tipo !== "HEADER")) {
      armazem.removeItem(AGENDA_OFFLINE_KEY);
      return null;
    }
    return { ...registro, agenda, inicios };
  } catch {
    return null;
  }
}

/** Serviço enviado ou concluído sai do cache; sobra o resto da agenda. */
export function removerDaAgendaOffline(detailId: string, armazem: ArmazemTexto | undefined = obterArmazem()) {
  if (!armazem) return;
  try {
    const bruto = armazem.getItem(AGENDA_OFFLINE_KEY);
    if (!bruto) return;
    const registro = JSON.parse(bruto) as AgendaOffline;
    const inicios = { ...registro.inicios };
    delete inicios[detailId];
    const restante = registro.agenda.filter((item) => item.id !== detailId && item.detail?.id !== detailId);
    armazem.setItem(AGENDA_OFFLINE_KEY, JSON.stringify({ ...registro, agenda: montar(restante, inicios, new Date()), inicios }));
  } catch {
    armazem.removeItem(AGENDA_OFFLINE_KEY);
  }
}

export function limparAgendaOffline(armazem: ArmazemTexto | undefined = obterArmazem()) {
  try {
    armazem?.removeItem(AGENDA_OFFLINE_KEY);
  } catch {
    // Armazenamento bloqueado: nada a limpar.
  }
}

/** "Agenda de 14:32 (sem conexão)". */
export function avisoAgendaOffline(salvoEm: string) {
  const hora = new Date(salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `Agenda de ${hora} (sem conexão)`;
}

function usuarioAtual() {
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
