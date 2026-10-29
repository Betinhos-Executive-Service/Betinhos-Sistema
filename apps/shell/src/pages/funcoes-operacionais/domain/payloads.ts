// Corpos das gravações, iguais aos do WebResource: troca de motorista e duplicação (Web API direta), local da base e
// as Custom APIs da troca de carro. Lookups das Custom APIs vão como objeto de entidade com @odata.type.
import { CONFIG } from "./config";
import type { CloneServiceInput, RawRecord, ScheduleSwapInput, SwapUpdateInput, SwapWindowInput } from "./types";

export const WINDOW_MODE_FIXED = 100000000;
export const WINDOW_MODE_BETWEEN = 100000001;
export const SWAP_STATUS_PROGRAMMED = 202410000;
export const SWAP_STATUS_CONFIRMED = 100000001;
export const SWAP_STATUS_CONCLUDED = 202410001;
export const SWAP_STATUS_CANCELED = 202410002;
export const SERVICE_STATUS_CONFIRMED = 202410001;

export const OPERATION_REGISTER = "new_RegistrarTrocaDeCarro";
export const OPERATION_UPDATE = "new_AtualizarTrocaDeCarro";
export const OPERATION_CANCEL = "new_CancelarTrocaDeCarro";
export const OPERATION_REVERT = "new_ReverterTrocaDeCarro";

/** Tira as chaves do GUID (sem mudar maiúsculas, como o WebResource). */
export function cleanId(id: string): string {
  return String(id || "").replace(/[{}]/g, "");
}

export function buildBind(entitySetName: string, id: string): string {
  return `/${entitySetName}(${cleanId(id)})`;
}

function setLookup(payload: RawRecord, navCandidates: readonly string[], entitySetName: string, id: string | null): RawRecord {
  if (!id) return payload;
  const candidate = navCandidates.find(Boolean);
  return candidate ? { ...payload, [`${candidate}@odata.bind`]: buildBind(entitySetName, id) } : payload;
}

/** PATCH da reserva: define o motorista ou, sem `driverId`, retira. */
export function changeDriverPayload(driverId: string | null): RawRecord {
  const nav = CONFIG.nav.motorista[0];
  return driverId ? { [`${nav}@odata.bind`]: buildBind(CONFIG.entitySets.funcionario, driverId) } : { [nav]: null };
}

/** POST da reserva duplicada: nasce Confirmada; veículo, faturamento, categoria, retorno, OT e finalização não são copiados. */
export function buildClonePayload(input: CloneServiceInput): RawRecord {
  const fields = CONFIG.fields.reserva;
  let payload: RawRecord = {
    [fields.dataSaida]: input.dataSaida.toISOString(),
    [fields.obsOperacao]: input.obsOperacao,
    [fields.obsInterna]: input.obsInterna,
    [fields.statusOperacao]: SERVICE_STATUS_CONFIRMED,
    [fields.tipoServico]: input.original.tipoServicoValue,
    [fields.tipoVeiculo]: input.original.tipoVeiculoValue,
    [fields.destino]: input.original.destino,
    [fields.enderecoSaida]: input.original.enderecoSaida,
    [fields.paxView]: input.original.paxView,
    [fields.trajeto]: input.original.trajeto,
    [fields.perfilPassageiro]: input.original.perfilPassageiro,
    [fields.email]: input.original.email,
    [fields.formaPagamento]: input.original.formaPagamentoValue,
    [fields.cotacao]: input.original.cotacao,
    [fields.cr]: input.original.cr
  };
  if (input.original.receberValue != null) payload[fields.receber] = input.original.receberValue;
  payload = setLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, input.original.clienteId);
  payload = setLookup(payload, CONFIG.nav.solicitante, CONFIG.entitySets.bancoDados, input.original.solicitanteId);
  payload = setLookup(payload, CONFIG.nav.motorista, CONFIG.entitySets.funcionario, input.driverId || null);
  return payload;
}

/** Vínculo de passageiro da cópia (o endereço por passageiro não é copiado). */
export function buildPassengerLinkPayload(newServiceId: string, link: { order: number; passengerId: string }): RawRecord {
  let payload: RawRecord = { [CONFIG.fields.servicoPassageiro.ordem]: link.order };
  payload = setLookup(payload, CONFIG.nav.servicoGeral, CONFIG.entitySets.reserva, newServiceId);
  payload = setLookup(payload, CONFIG.nav.servicoPassageiro, CONFIG.entitySets.bancoDados, link.passengerId);
  return payload;
}

export function buildLocationPayload(input: { name: string; address: string; mapUrl: string }): RawRecord {
  const fields = CONFIG.fields.localBase;
  const payload: RawRecord = { [fields.nome]: input.name.trim() };
  if (input.address.trim()) payload[fields.endereco] = input.address.trim();
  if (input.mapUrl.trim()) payload[fields.linkMapa] = input.mapUrl.trim();
  return payload;
}

function reference(entityType: string, idField: string, id: string | null | undefined) {
  return id ? { "@odata.type": `Microsoft.Dynamics.CRM.${entityType}`, [idField]: cleanId(id) } : undefined;
}

function serviceReference(id?: string | null) {
  return reference(CONFIG.entities.reserva, "cr40f_reservadeveculosid", id);
}

/** Parâmetros do modo da janela para Registrar/Atualizar; âncoras só no modo Entre serviços. */
export function windowParameters(input: SwapWindowInput, clearEmptyLocation = false): RawRecord {
  const between = input.windowMode === "between";
  const params: RawRecord = { new_ModoJanela: between ? WINDOW_MODE_BETWEEN : WINDOW_MODE_FIXED };
  if (between) {
    if (input.driver1AfterId) params.new_M1DepoisDe = serviceReference(input.driver1AfterId);
    if (input.driver1BeforeId) params.new_M1AntesDe = serviceReference(input.driver1BeforeId);
    if (input.driver2AfterId) params.new_M2DepoisDe = serviceReference(input.driver2AfterId);
    if (input.driver2BeforeId) params.new_M2AntesDe = serviceReference(input.driver2BeforeId);
  }
  if (input.location?.trim()) params.new_Local = input.location.trim();
  else if (clearEmptyLocation) params.new_Local = "";
  return params;
}

/** FNV-1a 32 bits (semente 2166136261, primo 16777619), em hexadecimal. */
export function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

/** Chave de idempotência do registro: `exchange-<fnv1a>-<início em ms, base 36>`. */
export function swapIdempotencyKey(input: ScheduleSwapInput): string {
  const preview = input.preview;
  const canonical = [
    input.start.toISOString(), input.end.toISOString(), input.typeValue, preview.driver1Id, preview.driver2Id, preview.vehicle1Id, preview.vehicle2Id, input.obs, preview.locationId,
    preview.windowMode || "fixed", preview.driver1AfterId || "", preview.driver1BeforeId || "", preview.driver2AfterId || "", preview.driver2BeforeId || "", preview.location || ""
  ].join("|");
  return `exchange-${fnv1a(canonical)}-${input.start.getTime().toString(36)}`;
}

/** Corpo de new_RegistrarTrocaDeCarro (unbound). Parâmetros opcionais vazios não são enviados. */
export function buildRegisterSwapRequest(input: ScheduleSwapInput): RawRecord {
  const preview = input.preview;
  const request: RawRecord = {
    new_Motivo: input.obs?.trim() || "Registro operacional da troca.",
    new_Inicio: input.start.toISOString(),
    new_Fim: input.end.toISOString(),
    new_Tipo: input.typeValue,
    new_Motorista1: reference(CONFIG.entities.funcionario, "cr40f_funcionariosid", preview.driver1Id),
    new_Observacao: input.obs,
    new_ConcluirImediatamente: !!input.effectiveAt,
    new_ProgramarAutomaticamente: input.programAutomatically,
    new_IdempotencyKey: swapIdempotencyKey(input),
    ...windowParameters(preview)
  };
  if (input.effectiveAt) request.new_DataEfetiva = input.effectiveAt.toISOString();
  if (preview.driver2Id) request.new_Motorista2 = reference(CONFIG.entities.funcionario, "cr40f_funcionariosid", preview.driver2Id);
  if (preview.vehicle1Id) request.new_Veiculo1 = reference(CONFIG.entities.veiculo, "cr40f_veiculosid", preview.vehicle1Id);
  if (preview.vehicle2Id) request.new_Veiculo2 = reference(CONFIG.entities.veiculo, "cr40f_veiculosid", preview.vehicle2Id);
  if (preview.locationId) request.new_LocalDeBase = reference(CONFIG.entities.localBase, CONFIG.fields.localBase.id, preview.locationId);
  return request;
}

/** Corpo de new_AtualizarTrocaDeCarro: só janela, âncoras, local e observação; `new_Local` vazio limpa o campo. */
export function buildUpdateSwapPayload(input: SwapUpdateInput): RawRecord {
  return {
    new_Motivo: input.obs?.trim() || "Atualização operacional da troca.",
    new_VersaoEsperada: input.rowVersion,
    new_Inicio: input.start.toISOString(),
    new_Fim: input.end.toISOString(),
    new_Observacao: input.obs,
    ...(input.windowMode ? windowParameters(input, true) : {})
  };
}

/** Corpo de new_CancelarTrocaDeCarro / new_ReverterTrocaDeCarro (data efetiva só na reversão). */
export function buildLifecyclePayload(reason: string, rowVersion = "", effectiveAt?: Date): RawRecord {
  const payload: RawRecord = { new_Motivo: reason, new_VersaoEsperada: rowVersion };
  if (effectiveAt) payload.new_DataEfetiva = effectiveAt.toISOString();
  return payload;
}

/** Caminho da Custom API: unbound (`new_X`) ou bound na troca (`cr40f_trocasdecarros(id)/Microsoft.Dynamics.CRM.new_X`). */
export function customApiPath(operationName: string, swapId?: string): string {
  return swapId ? `${CONFIG.entitySets.trocaCarro}(${cleanId(swapId)})/Microsoft.Dynamics.CRM.${operationName}` : operationName;
}

/** Mensagem útil de um erro do Dataverse, procurada em message/detail/title/reason/description e nos aninhados. */
export function extractDataverseErrorMessage(error: unknown): string {
  const seen = new Set<unknown>();
  const visit = (value: unknown): string => {
    if (value == null || seen.has(value)) return "";
    if (typeof value === "string") return value.trim();
    if (value instanceof Error && value.message?.trim()) return value.message.trim();
    if (typeof value !== "object") return "";
    seen.add(value);
    const candidate = value as Record<string, unknown>;
    for (const key of ["message", "detail", "title", "reason", "description"]) {
      const direct = candidate[key];
      if (typeof direct === "string" && direct.trim()) return direct.trim();
    }
    for (const key of ["error", "cause", "innerError", "innererror", "_errorFault", "details"]) {
      const nested = visit(candidate[key]);
      if (nested) return nested;
    }
    const responseText = candidate._responseText;
    if (typeof responseText === "string") {
      try {
        const parsed = visit(JSON.parse(responseText));
        if (parsed) return parsed;
      } catch {
        // Corpo que não é JSON: fica a mensagem original.
      }
    }
    return "";
  };
  return visit(error);
}

/** Erro do registro: "Falha ao registrar a troca no Dataverse: {mensagem}". */
export function buildSwapFailure(error: unknown, payload: RawRecord): Error {
  const detail = extractDataverseErrorMessage(error);
  const next = new Error(detail ? `Falha ao registrar a troca no Dataverse: ${detail}` : "Falha ao registrar a troca no Dataverse.") as Error & { cause?: unknown; details?: unknown; swapPayload?: RawRecord };
  next.cause = error;
  next.details = error;
  next.swapPayload = payload;
  return next;
}

/** Mensagem para o usuário a partir de qualquer erro, com fallback. */
export function userErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message.trim();
    if (candidate.error && typeof candidate.error === "object") {
      const nested = candidate.error as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
    }
  }
  return fallback;
}
