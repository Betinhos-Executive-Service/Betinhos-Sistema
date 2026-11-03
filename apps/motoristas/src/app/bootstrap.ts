import { agendaMock, historyMock } from "../data/mockData.ts";
import { shouldShowAgendaItemInGallery } from "./agendaVisibility.ts";
import { findDetailByParams, type LocalStore } from "../lib/localWorkflow.ts";
import type { DetailData } from "../types.ts";
import { reportAppError } from "../lib/appErrorLogger.ts";

export const STORAGE_KEY = "app-motoristas-local-v1";

export function isSameDetail(left: DetailData | undefined, right: DetailData) {
  return Boolean(left && left.id === right.id && left.type === right.type);
}

export function findFirstPendingDetail(agenda: LocalStore["agenda"]) {
  return agenda.find((item) => shouldShowAgendaItemInGallery(item) && item.tipo !== "HEADER" && !item.canceled && item.detail)?.detail;
}

export function findFirstPendingServiceDetail(agenda: LocalStore["agenda"]) {
  return agenda.find((item) => shouldShowAgendaItemInGallery(item) && item.tipo === "SERVICO" && !item.canceled && item.detail)?.detail;
}

export function initialStore(): LocalStore {
  return {
    agenda: agendaMock,
    history: historyMock,
    signatures: {},
    photos: {}
  };
}

export function loadStore(storage: Storage = window.localStorage): LocalStore {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalStore;
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "bootstrap", action: "loadStore", phase: "localStorage", notifyUser: false });
    // fallback local
  }

  return initialStore();
}

// Lê um parâmetro direto (?servicoId=) ou dentro de ?data= (o Dynamics repassa ao web resource o
// valor de navigateTo/Xrm como data=servicoId%3D...%26tipo%3DSERVICO, vindo do push via form OnLoad).
function readLaunchParam(search: string, name: string) {
  const params = new URLSearchParams(search);
  const direct = params.get(name);
  if (direct) return direct;
  return new URLSearchParams(params.get("data") ?? "").get(name) ?? "";
}

export function getInitialDetail(store: LocalStore, search = window.location.search): DetailData | null {
  const { serviceId, type } = getInitialParams(search);
  return findDetailByParams([...store.agenda, ...store.history], serviceId, type);
}

export function getInitialParams(search = window.location.search) {
  return {
    serviceId: readLaunchParam(search, "servicoId").trim(),
    type: readLaunchParam(search, "tipo").trim()
  };
}

const COMUNICADO_ID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

// Deep link de comunicado: ?comunicadoId=<id> ou ?data=comunicadoId%3D<id> (parâmetro que o Dynamics repassa ao web resource).
export function getInitialComunicadoId(search = window.location.search) {
  const value = readLaunchParam(search, "comunicadoId").trim();
  return COMUNICADO_ID_PATTERN.test(value) ? value.replace(/[{}]/g, "").toLowerCase() : "";
}

// Deep link do checklist de vistoria: ?checklistId=<id> ou ?data=checklistId%3D<id> (push via form OnLoad).
export function getInitialChecklistId(search = window.location.search) {
  const value = readLaunchParam(search, "checklistId").trim();
  return COMUNICADO_ID_PATTERN.test(value) ? value.replace(/[{}]/g, "").toLowerCase() : "";
}

// Deep link do push do termo de multa: ?termoMultaId=<id> ou ?data=termoMultaId%3D<id> (push via form OnLoad).
// O App abre na tela Multas (rota #multas), que lista os termos pendentes do motorista.
export function getInitialTermoMultaId(search = window.location.search) {
  const value = readLaunchParam(search, "termoMultaId").trim();
  return COMUNICADO_ID_PATTERN.test(value) ? value.replace(/[{}]/g, "").toLowerCase() : "";
}

// Deep link do push de treinamento: ?treinamentoParticipacaoId=<id> ou ?data=treinamentoParticipacaoId%3D<id> (push via form OnLoad).
// O App abre na tela Treinamentos e, depois do carregamento, no detalhe dessa participação.
export function getInitialTreinamentoParticipacaoId(search = window.location.search) {
  const value = readLaunchParam(search, "treinamentoParticipacaoId").trim();
  return COMUNICADO_ID_PATTERN.test(value) ? value.replace(/[{}]/g, "").toLowerCase() : "";
}

export function getVoucherDraftKey(detail: DetailData) {
  return `${detail.type}:${detail.id}`;
}
