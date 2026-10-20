import { DATAVERSE, retrieveMultiple, retrieveOne } from "./dataverse.ts";

// Checklist de vistoria de veículo. Contrato com o plugin ChecklistCommandPlugin
// (plugins/DriverRecordSharing/ChecklistAnswers.cs): itens copiados do modelo e respostas em JSON.

export const CHECKLIST_ESTADO = { aguardandoMotorista: 100000000, pendente: 100000001, concluido: 100000002, cancelado: 100000003 } as const;
export const CHECKLIST_ORIGEM = { quinzenal: 100000000, manual: 100000001 } as const;
export const CHECKLIST_MAX_FOTOS_POR_ITEM = 5;
export const CHECKLIST_MAX_TEXTO = 2000;

export type ChecklistItemTipo = "foto" | "numero" | "texto";

export type ChecklistItem = {
  chave: string;
  ordem: number;
  rotulo: string;
  instrucao: string;
  tipo: ChecklistItemTipo;
  obrigatorio: boolean;
  unidade: string;
};

export type ChecklistFotoEnviada = { link: string; caminho: string; nomeArquivo: string };

export type ChecklistResposta = {
  chave: string;
  rotulo: string;
  tipo: ChecklistItemTipo;
  valor: string;
  fotos: ChecklistFotoEnviada[];
};

export type ChecklistVeiculo = {
  id: string;
  nome: string;
  motoristaId: string;
  veiculoId: string;
  placa: string;
  estado: number;
  origem: number;
  solicitadoEm: string;
  concluidoEm: string | null;
  odometro: number | null;
  itens: ChecklistItem[];
  respostas: ChecklistResposta[];
};

export type ChecklistFotoRascunho = { id: string; dataUrl: string };

// Rascunho local (IndexedDB) do motorista: sobrevive ao fechar o app no meio da vistoria.
export type ChecklistDraft = {
  checklistId: string;
  valores: Record<string, string>;
  fotos: Record<string, ChecklistFotoRascunho[]>;
  // Fotos já salvas no OneDrive (por id da foto do rascunho): repetir o envio não sobe de novo.
  enviadas?: Record<string, ChecklistFotoEnviada>;
  updatedAt: string;
};

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const cleanGuid = (value: string) => value.replace(/[{}]/g, "").toLowerCase();
export const isMockChecklists = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");
export const checklistDraftKey = (checklistId: string) => `checklist:${cleanGuid(checklistId)}`;

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const asTipo = (value: unknown): ChecklistItemTipo => value === "foto" || value === "numero" ? value : "texto";

export function parseChecklistItems(value: unknown): ChecklistItem[] {
  return asArray(value)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        chave: String(row.chave ?? ""),
        ordem: Number(row.ordem ?? 0) || 0,
        rotulo: String(row.rotulo ?? ""),
        instrucao: String(row.instrucao ?? ""),
        tipo: asTipo(row.tipo),
        obrigatorio: row.obrigatorio === true,
        unidade: String(row.unidade ?? "")
      };
    })
    .filter((item) => item.chave && item.rotulo)
    .sort((a, b) => a.ordem - b.ordem);
}

export function parseChecklistRespostas(value: unknown): ChecklistResposta[] {
  return asArray(value).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      chave: String(row.chave ?? ""),
      rotulo: String(row.rotulo ?? ""),
      tipo: asTipo(row.tipo),
      valor: String(row.valor ?? ""),
      fotos: asArray(row.fotos).map((foto) => {
        const item = (foto ?? {}) as Record<string, unknown>;
        return { link: String(item.link ?? ""), caminho: String(item.caminho ?? ""), nomeArquivo: String(item.nomeArquivo ?? "") };
      }).filter((foto) => foto.link)
    };
  }).filter((row) => row.chave);
}

export function mapChecklist(row: Record<string, unknown>): ChecklistVeiculo {
  const odometro = row.new_odometroinfleet == null || row.new_odometroinfleet === "" ? null : Number(row.new_odometroinfleet);
  return {
    id: String(row.new_checklistveiculoid ?? ""),
    nome: String(row.new_name ?? ""),
    motoristaId: String(row._new_motorista_value ?? ""),
    veiculoId: String(row._new_veiculo_value ?? ""),
    // O nome primário do veículo é a placa.
    placa: String(row["_new_veiculo_value@OData.Community.Display.V1.FormattedValue"] ?? ""),
    estado: Number(row.new_estado),
    origem: Number(row.new_origem),
    solicitadoEm: String(row.new_solicitadoem ?? row.createdon ?? ""),
    concluidoEm: row.new_concluidoem ? String(row.new_concluidoem) : null,
    odometro: Number.isFinite(odometro) ? odometro : null,
    itens: parseChecklistItems(row.new_itensjson),
    respostas: parseChecklistRespostas(row.new_respostasjson)
  };
}

export const isChecklistPending = (item: ChecklistVeiculo) => item.estado === CHECKLIST_ESTADO.pendente;

// Aceita "45210", "45.210" (milhar), "45210,5" e "12.5". Retorna "" quando vazio e null quando inválido.
export function normalizeChecklistNumber(input: string): string | null {
  const raw = input.replace(/\s/g, "");
  if (!raw) return "";
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000) return null;
  return String(value);
}

const isOdometerItem = (item: ChecklistItem) => item.tipo === "numero" && /^km$/i.test(item.unidade.trim());

export function createChecklistDraft(checklist: ChecklistVeiculo): ChecklistDraft {
  const valores: Record<string, string> = {};
  // Hodômetro sincronizado da Infleet sugere o KM; o motorista confere e corrige.
  if (checklist.odometro != null) {
    for (const item of checklist.itens) if (isOdometerItem(item)) valores[item.chave] = String(Math.round(checklist.odometro));
  }
  return { checklistId: checklist.id, valores, fotos: {}, updatedAt: new Date().toISOString() };
}

export function validateChecklistDraft(itens: ChecklistItem[], draft: ChecklistDraft) {
  const errors: Record<string, string> = {};
  for (const item of itens) {
    const fotos = draft.fotos[item.chave] ?? [];
    const valor = draft.valores[item.chave] ?? "";
    if (item.tipo === "foto") {
      if (item.obrigatorio && fotos.length === 0) errors[item.chave] = "Tire a foto para continuar.";
      else if (fotos.length > CHECKLIST_MAX_FOTOS_POR_ITEM) errors[item.chave] = `Envie até ${CHECKLIST_MAX_FOTOS_POR_ITEM} fotos.`;
    } else if (item.tipo === "numero") {
      const normalized = normalizeChecklistNumber(valor);
      if (normalized === null) errors[item.chave] = `Informe só números. Ex.: ${/^km$/i.test(item.unidade.trim()) ? "45210" : "75"}.`;
      else if (item.obrigatorio && !normalized) errors[item.chave] = "Preencha este campo.";
    } else {
      if (valor.trim().length > CHECKLIST_MAX_TEXTO) errors[item.chave] = `Use até ${CHECKLIST_MAX_TEXTO} caracteres.`;
      else if (item.obrigatorio && !valor.trim()) errors[item.chave] = "Preencha este campo.";
    }
  }
  return errors;
}

export function countChecklistProgress(itens: ChecklistItem[], draft: ChecklistDraft) {
  const done = itens.filter((item) => item.tipo === "foto"
    ? (draft.fotos[item.chave] ?? []).length > 0
    : Boolean((draft.valores[item.chave] ?? "").trim())).length;
  return { done, total: itens.length };
}

// Mesmo formato que ChecklistAnswers.Validate espera: [{ chave, valor, fotos: [{ link, caminho, nomeArquivo }] }].
export function buildChecklistRespostasJson(itens: ChecklistItem[], draft: ChecklistDraft, uploaded: Record<string, ChecklistFotoEnviada[]>) {
  return JSON.stringify(itens.map((item) => {
    if (item.tipo === "foto") return { chave: item.chave, fotos: uploaded[item.chave] ?? [] };
    const valor = draft.valores[item.chave] ?? "";
    return { chave: item.chave, valor: item.tipo === "numero" ? normalizeChecklistNumber(valor) ?? "" : valor.trim() };
  }));
}

// ---------- Mock local (localhost) ----------

const MOCK_DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const mockItens = (): ChecklistItem[] => [
  { chave: "a0000000-0000-4000-8000-000000000001", ordem: 1, rotulo: "Frente do veículo", instrucao: "Enquadre o carro inteiro, com a placa legível.", tipo: "foto", obrigatorio: true, unidade: "" },
  { chave: "a0000000-0000-4000-8000-000000000002", ordem: 2, rotulo: "Traseira do veículo", instrucao: "Enquadre o carro inteiro, com a placa legível.", tipo: "foto", obrigatorio: true, unidade: "" },
  { chave: "a0000000-0000-4000-8000-000000000003", ordem: 3, rotulo: "Lateral esquerda", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "" },
  { chave: "a0000000-0000-4000-8000-000000000004", ordem: 4, rotulo: "Lateral direita", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "" },
  { chave: "a0000000-0000-4000-8000-000000000005", ordem: 5, rotulo: "Painel ligado", instrucao: "Mostre o hodômetro e o nível de combustível.", tipo: "foto", obrigatorio: true, unidade: "" },
  { chave: "a0000000-0000-4000-8000-000000000006", ordem: 6, rotulo: "Quilometragem", instrucao: "Confira o número do painel.", tipo: "numero", obrigatorio: true, unidade: "km" },
  { chave: "a0000000-0000-4000-8000-000000000007", ordem: 7, rotulo: "Combustível", instrucao: "Nível aproximado do tanque.", tipo: "numero", obrigatorio: false, unidade: "%" },
  { chave: "a0000000-0000-4000-8000-000000000008", ordem: 8, rotulo: "Observações", instrucao: "Avarias, limpeza, itens faltando ou o que mais a operação precisa saber.", tipo: "texto", obrigatorio: false, unidade: "" }
];

let localMock: ChecklistVeiculo[] | null = null;

function getLocalMock() {
  if (localMock) return localMock;
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now - offsetDays * 86_400_000).toISOString();
  const itens = mockItens();
  localMock = [
    {
      id: "c0000000-0000-4000-8000-000000000001", nome: "Checklist ABC1D23 - quinzenal", motoristaId: MOCK_DRIVER_ID, veiculoId: "v1", placa: "ABC1D23",
      estado: CHECKLIST_ESTADO.pendente, origem: CHECKLIST_ORIGEM.quinzenal, solicitadoEm: iso(0), concluidoEm: null, odometro: 45210, itens, respostas: []
    },
    {
      id: "c0000000-0000-4000-8000-000000000002", nome: "Checklist ABC1D23 - anterior", motoristaId: MOCK_DRIVER_ID, veiculoId: "v1", placa: "ABC1D23",
      estado: CHECKLIST_ESTADO.concluido, origem: CHECKLIST_ORIGEM.quinzenal, solicitadoEm: iso(15), concluidoEm: iso(14), odometro: 44100, itens,
      respostas: itens.map((item) => ({
        chave: item.chave, rotulo: item.rotulo, tipo: item.tipo,
        valor: item.tipo === "numero" ? (item.unidade === "km" ? "44102" : "75") : item.tipo === "texto" ? "Sem avarias." : "",
        fotos: item.tipo === "foto" ? [{ link: "https://example.com/mock-foto.jpg", caminho: "Checklists/mock", nomeArquivo: `${item.rotulo}.jpg` }] : []
      }))
    }
  ];
  return localMock;
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------- Leitura ----------

const CHECKLIST_SELECT = "$select=new_checklistveiculoid,new_name,_new_motorista_value,_new_veiculo_value,new_estado,new_origem,new_solicitadoem,new_concluidoem,new_odometroinfleet,new_itensjson,new_respostasjson,createdon";

export async function loadDriverChecklists(motoristaId: string): Promise<ChecklistVeiculo[]> {
  if (isMockChecklists()) { await delay(150); return clone(getLocalMock()); }
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para carregar checklists.");
  // Pendentes e os concluídos mais recentes do motorista logado (admin enxergaria todos sem o filtro).
  const filter = `_new_motorista_value eq ${id} and (new_estado eq ${CHECKLIST_ESTADO.pendente} or new_estado eq ${CHECKLIST_ESTADO.concluido})`;
  const result = await retrieveMultiple(DATAVERSE.checklistVeiculos, `${CHECKLIST_SELECT}&$filter=${filter}&$orderby=new_solicitadoem desc&$top=20`);
  return result.entities.map(mapChecklist).filter((row) => cleanGuid(row.motoristaId) === id);
}

// Caminho rápido do deep link (push): lê só o checklist apontado.
export async function loadDriverChecklist(id: string): Promise<ChecklistVeiculo | null> {
  const cleanId = cleanGuid(id);
  if (isMockChecklists()) return clone(getLocalMock().find((item) => item.id === cleanId) ?? null);
  const row = await retrieveOne(DATAVERSE.checklistVeiculos, cleanId, CHECKLIST_SELECT);
  return row ? mapChecklist(row as Record<string, unknown>) : null;
}

// ---------- Conclusão ----------

type XrmApi = { WebApi?: { online?: { execute?: (request: Record<string, unknown>) => Promise<Response> } } };

// Copiado de executeComunicadoAction (comunicados.ts): parâmetros sempre Edm.String e execute com bind.
export async function executeChecklistAction(operationName: string, parameters: Record<string, string>) {
  let xrm: XrmApi | undefined;
  try { xrm = (window.parent as Window & { Xrm?: XrmApi }).Xrm; } catch { /* Parent may be cross-origin. */ }
  xrm ??= (window as Window & { Xrm?: XrmApi }).Xrm;
  const online = xrm?.WebApi?.online;
  const execute = online?.execute?.bind(online);
  if (!execute) throw new Error("Abra o aplicativo no Power Apps para enviar o checklist.");
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((key) => [key, { typeName: "Edm.String", structuralProperty: 1 }]));
  const response = await execute({
    ...parameters,
    getMetadata: () => ({ boundParameter: null, operationType: 0, operationName, parameterTypes })
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "Resposta indisponível.");
    let responseDetail: unknown = responseBody.slice(0, 4000);
    let message = `Não foi possível enviar o checklist (${response.status}).`;
    try {
      responseDetail = JSON.parse(responseBody);
      const serverMessage = (responseDetail as { error?: { message?: string } })?.error?.message;
      if (serverMessage) message = serverMessage;
    } catch { /* Response may be plain text. */ }
    throw Object.assign(new Error(message), {
      code: response.status,
      operationName,
      requestId: response.headers.get("x-ms-service-request-id") ?? response.headers.get("REQ_ID") ?? "",
      responseBody: responseDetail
    });
  }
}

export async function concluirChecklist(id: string, respostasJson: string) {
  const cleanId = cleanGuid(id);
  if (isMockChecklists()) {
    await delay(400);
    const row = getLocalMock().find((item) => item.id === cleanId);
    if (!row) throw new Error("Checklist não encontrado.");
    if (row.estado === CHECKLIST_ESTADO.concluido) return;
    const respostas = (JSON.parse(respostasJson) as { chave: string; valor?: string; fotos?: ChecklistFotoEnviada[] }[]);
    row.respostas = row.itens.map((item) => {
      const answer = respostas.find((entry) => entry.chave === item.chave);
      return { chave: item.chave, rotulo: item.rotulo, tipo: item.tipo, valor: answer?.valor ?? "", fotos: answer?.fotos ?? [] };
    });
    row.estado = CHECKLIST_ESTADO.concluido;
    row.concluidoEm = new Date().toISOString();
    return;
  }
  await executeChecklistAction("new_ConcluirChecklistVeiculo", { new_ChecklistId: cleanId, new_RespostasJson: respostasJson });
}

export async function uploadChecklistPhotoMock(fileName: string): Promise<ChecklistFotoEnviada> {
  await delay(250);
  return { link: `https://example.com/mock/${encodeURIComponent(fileName)}`, caminho: "Checklists/DEV/mock", nomeArquivo: fileName };
}
