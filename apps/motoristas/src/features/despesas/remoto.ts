// Gastos no Dataverse: dados de referência, modo de envio, envio assíncrono, nota fiscal, leitura rápida, conferência no envio e consulta do comprovante.
import { ATTACHMENT_STATUS, type ExpenseSubmission, type ExpenseUploadItem, type ExpenseUploadRow } from "./expenseUploadState.ts";
import { type ExpenseLookupNavigationNames, type ExpenseReferenceData } from "./expenses.ts";
import { decideExpenseUploadMode, type ExpenseUploadMode } from "./expenseUploadMode.ts";
import { cleanGuid, cleanODataGuid, createOne, dataverseLog, dataverseWarn, describeDataverseError, hasDataverseRuntime, retrieveMultiple, retrieveMultipleAll } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { bind, getBooleanValue, getClientUrl } from "../../data/dataverse/registros.ts";
import { FLOW_URLS, describeFlowUrl, getCurrentClientUrlKey, resolveFlowUrl, runHttpFlow } from "../../data/dataverse/flow.ts";
import { type LookupNavigationRequest, assertEntityHasAttributes, resolveLookupNavigationName } from "../../data/dataverse/metadados.ts";
import { assertValidBase64Payload, dataUrlToBase64, getDataUrlMimeType, getFileExtensionFromMimeType, sanitizePathSegment, shouldUseDevFolderPrefix, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";

let expenseReferenceDataCache: ExpenseReferenceData | null = null;
let expenseReferenceDataPromise: Promise<ExpenseReferenceData> | null = null;

const EXPENSE_CATEGORY_ACTIVE_QUERY =
  "$select=cr40f_categoriadespesaoperacionalid,cr40f_nome,cr40f_ordem,cr40f_exigeveiculo,cr40f_exigereserva,cr40f_exigekm,cr40f_exigelitros,cr40f_ativa&$filter=cr40f_ativa eq true&$orderby=cr40f_ordem asc,cr40f_nome asc";
const EXPENSE_CATEGORY_ALL_QUERY =
  "$select=cr40f_categoriadespesaoperacionalid,cr40f_nome,cr40f_ordem,cr40f_exigeveiculo,cr40f_exigereserva,cr40f_exigekm,cr40f_exigelitros,cr40f_ativa&$orderby=cr40f_ordem asc,cr40f_nome asc";
const EXPENSE_CATEGORY_MINIMAL_QUERY =
  "$select=cr40f_categoriadespesaoperacionalid,cr40f_nome&$orderby=cr40f_nome asc";
const EXPENSE_PAYMENT_ACTIVE_QUERY =
  "$select=cr40f_formapagamentodespesaid,cr40f_nome,cr40f_ordem,cr40f_tipo,cr40f_ativa&$filter=cr40f_ativa eq true&$orderby=cr40f_ordem asc,cr40f_nome asc";
const EXPENSE_PAYMENT_ALL_QUERY =
  "$select=cr40f_formapagamentodespesaid,cr40f_nome,cr40f_ordem,cr40f_tipo,cr40f_ativa&$orderby=cr40f_ordem asc,cr40f_nome asc";
const EXPENSE_PAYMENT_MINIMAL_QUERY =
  "$select=cr40f_formapagamentodespesaid,cr40f_nome&$orderby=cr40f_nome asc";
const EXPENSE_CITY_QUERY =
  "$select=cr40f_cidadeid,cr40f_name,cr40f_nome,cr40f_uf,cr40f_pais,cr40f_codigo_ibge,cr40f_ativa&$filter=cr40f_ativa eq true&$orderby=cr40f_uf asc,cr40f_nome asc";
const EXPENSE_CITY_ALL_QUERY =
  "$select=cr40f_cidadeid,cr40f_name,cr40f_nome,cr40f_uf,cr40f_pais,cr40f_codigo_ibge,cr40f_ativa&$orderby=cr40f_uf asc,cr40f_nome asc";

async function retrieveExpenseReferenceRecords(entitySetName: string, label: string, activeQuery: string, allQuery: string, minimalQuery: string) {
  let activeError: unknown = null;
  try {
    const activeResult = await retrieveMultiple(entitySetName, activeQuery);
    if (activeResult.entities.length) return activeResult;
    dataverseWarn(`Referencia de despesa sem registros ativos: ${label}. Tentando consulta sem filtro de ativo.`);
  } catch (error) {
    activeError = error;
    dataverseWarn(`Consulta ativa de referencia de despesa falhou: ${label}. Tentando consulta sem filtro de ativo.`, describeDataverseError(error));
  }

  try {
    const allResult = await retrieveMultiple(entitySetName, allQuery);
    if (allResult.entities.length) return allResult;
    dataverseWarn(`Referencia de despesa vazia: ${label}. Tentando consulta minima.`);
  } catch (error) {
    dataverseWarn(`Consulta completa de referencia de despesa falhou: ${label}. Tentando consulta minima.`, describeDataverseError(error));
  }

  try {
    return await retrieveMultiple(entitySetName, minimalQuery);
  } catch (error) {
    throw activeError ?? error;
  }
}

function hasCompleteExpenseReferenceData(referenceData: ExpenseReferenceData) {
  return referenceData.categories.length > 0 && referenceData.paymentMethods.length > 0 && referenceData.cities.length > 0;
}

async function fetchExpenseReferenceDataRemote(): Promise<ExpenseReferenceData> {
  const [categoryResult, paymentResult, cityResult] = await Promise.all([
    retrieveExpenseReferenceRecords(
      DATAVERSE.categoriasDespesasOperacionais,
      "categorias",
      EXPENSE_CATEGORY_ACTIVE_QUERY,
      EXPENSE_CATEGORY_ALL_QUERY,
      EXPENSE_CATEGORY_MINIMAL_QUERY
    ),
    retrieveExpenseReferenceRecords(
      DATAVERSE.formasPagamentoDespesas,
      "formas de pagamento",
      EXPENSE_PAYMENT_ACTIVE_QUERY,
      EXPENSE_PAYMENT_ALL_QUERY,
      EXPENSE_PAYMENT_MINIMAL_QUERY
    ),
    retrieveMultipleAll(DATAVERSE.cidades, EXPENSE_CITY_QUERY).catch((error) => {
      dataverseWarn("Consulta ativa de cidades falhou. Tentando consulta sem filtro de ativo.", describeDataverseError(error));
      return retrieveMultipleAll(DATAVERSE.cidades, EXPENSE_CITY_ALL_QUERY);
    })
  ]);

  return {
    categories: categoryResult.entities
      .map((record) => ({
        id: cleanODataGuid(record.cr40f_categoriadespesaoperacionalid),
        name: String(record.cr40f_nome ?? "").trim(),
        order: Number(record.cr40f_ordem ?? 9999),
        exigeVeiculo: getBooleanValue(record, "cr40f_exigeveiculo"),
        exigeReserva: getBooleanValue(record, "cr40f_exigereserva"),
        exigeKm: getBooleanValue(record, "cr40f_exigekm"),
        exigeLitros: getBooleanValue(record, "cr40f_exigelitros")
      }))
      .filter((category) => Boolean(category.id && category.name)),
    paymentMethods: paymentResult.entities
      .map((record) => ({
        id: cleanODataGuid(record.cr40f_formapagamentodespesaid),
        name: String(record.cr40f_nome ?? "").trim(),
        order: Number(record.cr40f_ordem ?? 9999),
        tipo: String(record.cr40f_tipo ?? "").trim()
      }))
      .filter((method) => Boolean(method.id && method.name)),
    cities: cityResult.entities
      .map((record) => {
        const nome = String(record.cr40f_nome ?? record.cr40f_name ?? "").trim();
        const uf = String(record.cr40f_uf ?? "").trim().toUpperCase();
        const pais = String(record.cr40f_pais ?? "Brasil").trim() || "Brasil";
        return {
          id: cleanODataGuid(record.cr40f_cidadeid),
          name: [nome, uf].filter(Boolean).join(" - "),
          order: 0,
          uf,
          pais,
          codigoIbge: String(record.cr40f_codigo_ibge ?? "").trim()
        };
      })
      .filter((city) => Boolean(city.id && city.name))
  };
}

export async function loadExpenseReferenceDataRemote(): Promise<ExpenseReferenceData> {
  if (expenseReferenceDataCache) {
    dataverseLog("Referencia de despesa carregada do cache em memoria.", {
      categories: expenseReferenceDataCache.categories.length,
      paymentMethods: expenseReferenceDataCache.paymentMethods.length,
      cities: expenseReferenceDataCache.cities.length
    });
    return expenseReferenceDataCache;
  }

  if (expenseReferenceDataPromise) {
    dataverseLog("Referencia de despesa reaproveitando consulta em andamento.");
    return expenseReferenceDataPromise;
  }

  const startedAt = performance.now();
  expenseReferenceDataPromise = fetchExpenseReferenceDataRemote()
    .then((referenceData) => {
      const complete = hasCompleteExpenseReferenceData(referenceData);
      if (complete) expenseReferenceDataCache = referenceData;
      dataverseLog("Referencia de despesa carregada.", {
        durationMs: Math.round(performance.now() - startedAt),
        categories: referenceData.categories.length,
        paymentMethods: referenceData.paymentMethods.length,
        cities: referenceData.cities.length,
        cached: complete
      });
      return referenceData;
    })
    .finally(() => {
      expenseReferenceDataPromise = null;
    });

  return expenseReferenceDataPromise;
}

export function prefetchExpenseReferenceDataRemote() {
  void loadExpenseReferenceDataRemote().catch((error) => {
    dataverseWarn("Pre-carga de referencia de despesa falhou.", describeDataverseError(error));
  });
}

let resolvedExpenseUploadMode: { clientUrl: string; mode: ExpenseUploadMode } | null = null;

/**
 * Decide o caminho de envio dos comprovantes pela configuracao do ambiente atual
 * (new_FlowURLDespesaAsync + colunas do anexo), nunca pela URL do ambiente.
 * Nunca lanca: qualquer falha antes de criar registros mantem o envio legado.
 */
export async function resolveExpenseUploadModeRemote(): Promise<ExpenseUploadMode> {
  const mode = await decideExpenseUploadMode({
    hasRuntime: hasDataverseRuntime,
    resolveAsyncFlowUrl: () => resolveFlowUrl(FLOW_URLS.expenseAsync),
    assertAsyncSchema: () => assertEntityHasAttributes(DATAVERSE.anexosDespesasOperacionais, "Anexos de despesas", ["new_uploadattemptid", "new_uploadrunid", "new_uploaderror", "cr40f_mimetype", "cr40f_driveitemid"]),
    warn: dataverseWarn
  });
  resolvedExpenseUploadMode = { clientUrl: getCurrentClientUrlKey(), mode };
  return mode;
}

export function usesAsyncExpenseUpload() {
  return hasDataverseRuntime()
    && resolvedExpenseUploadMode?.mode === "async"
    && resolvedExpenseUploadMode.clientUrl === getCurrentClientUrlKey();
}

export function expenseSubmissionStorageKey(motoristaId: string) {
  return `expense-upload:${getClientUrl().toLowerCase()}:${cleanGuid(motoristaId)}`;
}

export function createExpenseUploadItem(dataUrl: string, order: number): ExpenseUploadItem {
  const mimeType = getDataUrlMimeType(dataUrl);
  const fileName = `comprovante-${order}.${getFileExtensionFromMimeType(mimeType)}`;
  assertValidBase64Payload(dataUrlToBase64(dataUrl), { fileName, mimeType });
  return { id: crypto.randomUUID(), attemptId: crypto.randomUUID(), dataUrl, mimeType, fileName, order, dispatchStarted: false };
}

async function expenseRequest(path: string, method = "GET", body?: Record<string, unknown>, headers: Record<string, string> = {}) {
  const response = await fetch(`${getClientUrl()}/api/data/v9.2/${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 404 && method === "GET") return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`Despesa: HTTP ${response.status}. ${text}`);
  return text ? JSON.parse(text) : {};
}

async function ensureExpenseRecord(entitySet: string, id: string, payload: Record<string, unknown>) {
  const path = `${entitySet}(${cleanGuid(id)})`;
  if (await expenseRequest(path)) return;
  try {
    await expenseRequest(path, "PATCH", payload, { "If-None-Match": "*" });
  } catch (error) {
    // A lost create response is recoverable only after the exact ID is found.
    if (!await expenseRequest(path)) throw error;
  }
}

export async function ensureExpenseSubmissionRemote(submission: ExpenseSubmission) {
  if (!usesAsyncExpenseUpload()) throw new Error("Envio assíncrono de despesas não configurado neste ambiente.");
  // Fail before creating any row when the deployment/permissions are incomplete.
  await assertEntityHasAttributes(DATAVERSE.anexosDespesasOperacionais, "Anexos de despesas", ["new_uploadattemptid", "new_uploadrunid", "new_uploaderror", "cr40f_mimetype", "cr40f_driveitemid"]);
  if (!await resolveFlowUrl(FLOW_URLS.expenseAsync)) throw new Error("Flow assíncrono de despesas não configurado.");
  const expensePayload = { ...submission.payload, new_uploadexpectedcount: submission.items.length };
  if (submission.existing) {
    // Gasto do cartão: completa a despesa do flow; If-Match impede criar outra se ela sumir.
    await expenseRequest(`${DATAVERSE.despesasOperacionais}(${cleanGuid(submission.expenseId)})`, "PATCH", expensePayload, { "If-Match": "*" });
  } else {
    await ensureExpenseRecord(DATAVERSE.despesasOperacionais, submission.expenseId, expensePayload);
  }
  if (!submission.items.length) return;
  const names = await loadExpenseAttachmentLookupNavigationNamesRemote();
  for (const item of submission.items) {
    await ensureExpenseRecord(DATAVERSE.anexosDespesasOperacionais, item.id, {
      // Gasto do cartão não reenvia cr40f_nome no PATCH: usa o estabelecimento.
      cr40f_nome: `Comprovante ${item.order} - ${String(submission.payload.cr40f_nome ?? (submission.draft.estabelecimento || "Despesa"))}`.slice(0, 120),
      cr40f_nomearquivo: item.fileName,
      cr40f_ordem: item.order,
      cr40f_mimetype: item.mimeType,
      cr40f_tipo: 100000000,
      cr40f_status: ATTACHMENT_STATUS.pending,
      new_uploadattemptid: item.attemptId,
      [`${names.despesa}@odata.bind`]: bind(DATAVERSE.despesasOperacionais, submission.expenseId),
      [`${names.enviadoPor}@odata.bind`]: bind(DATAVERSE.funcionarios, submission.motoristaId)
    });
  }
}

export async function loadExpenseUploadRowsRemote(expenseId: string): Promise<ExpenseUploadRow[]> {
  const result = await expenseRequest(`${DATAVERSE.anexosDespesasOperacionais}?$select=cr40f_anexodespesaoperacionalid,cr40f_status,new_uploadattemptid,new_uploaderror&$filter=_cr40f_despesa_value eq ${cleanGuid(expenseId)}`);
  return result?.value ?? [];
}

export async function transitionExpenseUploadRemote(command: Record<string, unknown>): Promise<{ applied: boolean; status: number }> {
  const result = await expenseRequest("new_ExpenseUploadTransition", "POST", { new_Command: JSON.stringify(command) });
  return JSON.parse(result.new_Result);
}

export async function dispatchExpenseUploadRemote(item: ExpenseUploadItem) {
  const url = await resolveFlowUrl(FLOW_URLS.expenseAsync);
  if (!url) throw new Error("Flow assíncrono de despesas não configurado.");
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentId: item.id, attemptId: item.attemptId, conteudoBase64: dataUrlToBase64(item.dataUrl) })
  });
  if (response.status !== 202) throw new Error(`Aceitação do comprovante indefinida: HTTP ${response.status}. Consulte o status antes de reenviar.`);
}

export async function uploadExpenseInvoiceRemote({
  expenseId,
  expenseName,
  motoristaId,
  dataUrl,
  fileName,
  order = 1,
  onProgress
}: {
  expenseId: string;
  expenseName: string;
  motoristaId?: string;
  dataUrl: string;
  fileName?: string;
  order?: number;
  onProgress?: (message: string) => void;
}) {
  if (!dataUrl) return "";
  const baseName = sanitizePathSegment(fileName?.replace(/\.[^.]+$/, ""), `comprovante-${order}`);
  const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
  const path = `Despesas/${devPrefix}${sanitizePathSegment(expenseName, "Sem nome")}`;
  const lookupNavigationNames = await loadExpenseAttachmentLookupNavigationNamesRemote();
  onProgress?.(`Enviando comprovante ${order}.`);
  const link = await uploadMaintenancePhoto(path, dataUrl, baseName, {
    despesaGuid: expenseId,
    despesaNome: expenseName,
    tipo: "COMPROVANTE",
    indice: order
  });

  onProgress?.(`Vinculando comprovante ${order} à despesa.`);
  const record: Record<string, unknown> = {
    cr40f_nome: `Comprovante ${order} - ${expenseName}`,
    cr40f_nomearquivo: fileName || `${baseName}`,
    cr40f_urlsharepoint: link,
    cr40f_sharelink: link,
    cr40f_dataenvio: new Date().toISOString(),
    cr40f_ordem: order,
    cr40f_status: 100000001,
    cr40f_tipo: 100000000,
    [`${lookupNavigationNames.despesa}@odata.bind`]: bind(DATAVERSE.despesasOperacionais, expenseId)
  };
  if (motoristaId) record[`${lookupNavigationNames.enviadoPor}@odata.bind`] = bind(DATAVERSE.funcionarios, motoristaId);
  await createOne(DATAVERSE.anexosDespesasOperacionais, record);
  return link;
}

type ExpenseAttachmentLookupNavigationNames = {
  despesa: string;
  enviadoPor: string;
};

export async function assertExpenseSchemaReadyRemote(options: { includeManutencao?: boolean } = {}) {
  const expenseFields = [
    "cr40f_nome",
    "cr40f_datagasto",
    "cr40f_valor",
    "cr40f_statusoperacional",
    "cr40f_statusfinanceiro",
    "cr40f_statusanexo",
    "cr40f_origem",
    "cr40f_observacao",
    "cr40f_estabelecimento",
    "cr40f_kminformado",
    "cr40f_litros"
  ];
  if (options.includeManutencao) expenseFields.push("_cr40f_manutencao_value");

  await Promise.all([
    assertEntityHasAttributes(DATAVERSE.despesasOperacionais, "Despesas", expenseFields),
    assertEntityHasAttributes(DATAVERSE.anexosDespesasOperacionais, "Anexos de Despesas", [
      "cr40f_nome",
      "cr40f_nomearquivo",
      "cr40f_urlsharepoint",
      "cr40f_sharelink",
      "cr40f_dataenvio",
      "cr40f_ordem",
      "cr40f_status",
      "cr40f_tipo"
    ]),
    assertEntityHasAttributes(DATAVERSE.categoriasDespesasOperacionais, "Categorias de Despesas", [
      "cr40f_nome",
      "cr40f_ativa",
      "cr40f_exigeveiculo",
      "cr40f_exigereserva",
      "cr40f_exigekm",
      "cr40f_exigelitros",
      "cr40f_ordem"
    ]),
    assertEntityHasAttributes(DATAVERSE.formasPagamentoDespesas, "Formas de Pagamento", [
      "cr40f_nome",
      "cr40f_ativa",
      "cr40f_tipo",
      "cr40f_ordem"
    ]),
    assertEntityHasAttributes(DATAVERSE.cidades, "Cidades", [
      "cr40f_name",
      "cr40f_nome",
      "cr40f_uf",
      "cr40f_pais",
      "cr40f_codigo_ibge",
      "cr40f_ativa"
    ])
  ]);
}

export async function loadExpenseLookupNavigationNamesRemote(options: { includeVeiculo?: boolean; includeReserva?: boolean; includeManutencao?: boolean } = {}): Promise<ExpenseLookupNavigationNames> {
  const requests: Array<LookupNavigationRequest & { key: keyof ExpenseLookupNavigationNames }> = [
    {
      key: "motorista",
      referencingEntitySetName: DATAVERSE.despesasOperacionais,
      referencedEntitySetName: DATAVERSE.funcionarios,
      referencingAttribute: "cr40f_motorista",
      label: "Despesa.Motorista",
      required: true
    },
    {
      key: "categoria",
      referencingEntitySetName: DATAVERSE.despesasOperacionais,
      referencedEntitySetName: DATAVERSE.categoriasDespesasOperacionais,
      referencingAttribute: "cr40f_categoria",
      label: "Despesa.Categoria",
      required: true
    },
    {
      key: "formaPagamento",
      referencingEntitySetName: DATAVERSE.despesasOperacionais,
      referencedEntitySetName: DATAVERSE.formasPagamentoDespesas,
      referencingAttribute: "cr40f_formapagamento",
      label: "Despesa.FormaPagamento",
      required: true
    },
    {
      key: "cidade",
      referencingEntitySetName: DATAVERSE.despesasOperacionais,
      referencedEntitySetName: DATAVERSE.cidades,
      referencingAttribute: "cr40f_cidade",
      label: "Despesa.Cidade",
      required: true
    }
  ];

  if (options.includeVeiculo) {
    requests.push({
      key: "veiculo",
        referencingEntitySetName: DATAVERSE.despesasOperacionais,
        referencedEntitySetName: DATAVERSE.veiculos,
        referencingAttribute: "cr40f_veiculo",
      label: "Despesa.Veiculo"
    });
  }
  if (options.includeReserva) {
    requests.push({
      key: "reserva",
        referencingEntitySetName: DATAVERSE.despesasOperacionais,
        referencedEntitySetName: DATAVERSE.geral,
        referencingAttribute: "cr40f_reserva",
        label: "Despesa.Reserva"
    });
  }
  if (options.includeManutencao) {
    requests.push({
      key: "manutencao",
      referencingEntitySetName: DATAVERSE.despesasOperacionais,
      referencedEntitySetName: DATAVERSE.manutencoes,
      referencingAttribute: "cr40f_manutencao",
      label: "Despesa.Manutencao"
    });
  }

  const settled = await Promise.allSettled(requests.map((request) => resolveLookupNavigationName(request)));
  const names: Partial<ExpenseLookupNavigationNames> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      names[request.key] = result.value;
      return;
    }
    failures.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (failures.length) {
    throw new Error(`Schema de Despesas incompleto. Rode repair-despesas-operacionais-relacionamentos.console.js. Falhas: ${failures.join(" | ")}`);
  }
  if (!names.motorista || !names.categoria || !names.formaPagamento || !names.cidade) {
    throw new Error("Schema de Despesas incompleto. Lookups obrigatorios nao resolvidos.");
  }
  return {
    motorista: names.motorista,
    categoria: names.categoria,
    formaPagamento: names.formaPagamento,
    cidade: names.cidade,
    veiculo: names.veiculo,
    reserva: names.reserva,
    manutencao: names.manutencao
  };
}

async function loadExpenseAttachmentLookupNavigationNamesRemote(): Promise<ExpenseAttachmentLookupNavigationNames> {
  const requests: Array<LookupNavigationRequest & { key: keyof ExpenseAttachmentLookupNavigationNames }> = [
    {
      key: "despesa",
      referencingEntitySetName: DATAVERSE.anexosDespesasOperacionais,
      referencedEntitySetName: DATAVERSE.despesasOperacionais,
      referencingAttribute: "cr40f_despesa",
      label: "AnexoDespesa.Despesa"
    },
    {
      key: "enviadoPor",
      referencingEntitySetName: DATAVERSE.anexosDespesasOperacionais,
      referencedEntitySetName: DATAVERSE.funcionarios,
      referencingAttribute: "cr40f_enviadopor",
      label: "AnexoDespesa.EnviadoPor"
    }
  ];

  const settled = await Promise.allSettled(requests.map((request) => resolveLookupNavigationName(request)));
  const names: Partial<ExpenseAttachmentLookupNavigationNames> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      names[request.key] = result.value;
      return;
    }
    failures.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (failures.length || !names.despesa || !names.enviadoPor) {
    throw new Error(`Schema de Anexos de Despesas incompleto. Rode repair-despesas-operacionais-relacionamentos.console.js. Falhas: ${failures.join(" | ")}`);
  }
  return { despesa: names.despesa, enviadoPor: names.enviadoPor };
}

/**
 * Leitura rapida do comprovante (Flow Despesas | Leitura rapida). Nao usa runHttpFlow: precisa de AbortSignal
 * para o timeout e nao pode registrar resumo de payload (imagem). Nunca loga a imagem nem a URL completa.
 * Nunca lanca: falha vira { ok: false } e o app segue no preenchimento manual.
 */
export async function readReceiptQuick(imagemBase64: string, categorias: string[], formasPagamento: string[], timeoutMs: number): Promise<unknown> {
  const url = await resolveFlowUrl(FLOW_URLS.quickRead);
  if (!url) return { ok: false, erro: "nao_configurado" };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ imagemBase64, mime: "image/jpeg", categorias, formasPagamento })
    });
    if (!response.ok) {
      dataverseWarn("Leitura rapida falhou.", { status: response.status, endpoint: describeFlowUrl(url) });
      return { ok: false };
    }
    return await response.json();
  } catch (error) {
    dataverseWarn("Leitura rapida sem resposta.", { endpoint: describeFlowUrl(url), error: error instanceof Error ? error.name : String(error) });
    return { ok: false };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Conferência da despesa no envio (Flow Despesas | Conferência no envio). Mesmo padrão da leitura rápida: timeout por
 * AbortSignal, nunca lança (falha vira { ok: false } e o app envia sem perguntar) e não registra o corpo.
 */
export async function conferirDespesaRemote(corpo: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const url = await resolveFlowUrl(FLOW_URLS.conferenciaEnvio);
  if (!url) return { ok: false, erro: "nao_configurado" };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(corpo) });
    if (!response.ok) {
      dataverseWarn("Conferencia no envio falhou.", { status: response.status, endpoint: describeFlowUrl(url) });
      return { ok: false };
    }
    return await response.json();
  } catch (error) {
    dataverseWarn("Conferencia no envio sem resposta.", { endpoint: describeFlowUrl(url), error: error instanceof Error ? error.name : String(error) });
    return { ok: false };
  } finally {
    window.clearTimeout(timer);
  }
}

export type ArquivoFlowResposta = { sucesso?: boolean; erro?: string; nomeArquivo?: string; mimeType?: string; conteudoBase64?: string };

/** Lê um comprovante pelo flow de consulta: por id do item (driveitemid) ou, nos antigos, pelo link de compartilhamento. */
export async function consultarArquivoComprovante(corpo: { id?: string; link?: string; nomeArquivo: string; origem?: string }) {
  return (await runHttpFlow(FLOW_URLS.consultarArquivo, corpo)) as ArquivoFlowResposta;
}
