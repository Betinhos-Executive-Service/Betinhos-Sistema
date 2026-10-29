// Cópia de src/lib/checklists.ts do App Motoristas (fonte canônica), trazida via tela-gestao-checklists.
// Mudanças de regra vão primeiro no App Motoristas; aqui só o caminho do import do Dataverse foi trocado.
import { DATAVERSE, retrieveMultiple, retrieveOne } from "../data/dataverse";

// Checklist de vistoria de veículo. Contrato com o plugin ChecklistCommandPlugin
// (plugins/DriverRecordSharing/ChecklistAnswers.cs): itens copiados do modelo e respostas em JSON.

export const CHECKLIST_ESTADO = { aguardandoMotorista: 100000000, pendente: 100000001, concluido: 100000002, cancelado: 100000003 } as const;
export const CHECKLIST_ORIGEM = { quinzenal: 100000000, manual: 100000001, troca: 100000002 } as const;
export const CHECKLIST_MAX_FOTOS_POR_ITEM = 5;
export const CHECKLIST_MAX_TEXTO = 2000;
export const CHECKLIST_MAX_OBSERVACAO = 500;
// O plugin recusa mais de 10 problemas por resposta (um item pode ter até 12 opções).
export const CHECKLIST_MAX_PROBLEMAS = 10;
export const CHECKLIST_PROBLEMAS_PADRAO = ["Arranhado", "Amassado", "Trincado", "Quebrado", "Faltando", "Sujo", "Outro"] as const;

export type ChecklistItemTipo = "foto" | "numero" | "texto" | "okNok";

export type ChecklistItem = {
  chave: string;
  ordem: number;
  rotulo: string;
  instrucao: string;
  tipo: ChecklistItemTipo;
  obrigatorio: boolean;
  unidade: string;
  opcoesProblema: string[];
};

export type ChecklistFotoEnviada = { link: string; caminho: string; nomeArquivo: string };

export type ChecklistResposta = {
  chave: string;
  rotulo: string;
  tipo: ChecklistItemTipo;
  valor: string;
  problemas: string[];
  observacao: string;
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
  entreguePorNome: string;
  trocaDetectadaEm: string | null;
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
  problemas?: Record<string, string[]>;
  observacoes?: Record<string, string>;
  // Fotos já salvas no OneDrive (por id da foto do rascunho): repetir o envio não sobe de novo.
  enviadas?: Record<string, ChecklistFotoEnviada>;
  // Chaves pré-preenchidas pelo app (ex.: KM da Infleet): válidas para envio, mas só contam no progresso depois que o motorista mexer.
  sugeridos?: string[];
  updatedAt: string;
};

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const cleanGuid = (value: string) => value.replace(/[{}]/g, "").toLowerCase();
export const isMockChecklists = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");
// Só no mock: `?mockChecklistFalha=foto` derruba um envio de foto sim, outro não (testa a retomada);
// `?mockChecklistFalha=registro` derruba o registro final.
export function mockChecklistFailure(search = globalThis.window?.location?.search ?? "") {
  const value = new URLSearchParams(search).get("mockChecklistFalha");
  return value === "foto" || value === "registro" ? value : "";
}
let mockPhotoUploads = 0;
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

const asTipo = (value: unknown): ChecklistItemTipo => value === "foto" || value === "numero" || value === "okNok" ? value : "texto";
const asStrings = (value: unknown) => asArray(value).map((entry) => String(entry ?? "").trim()).filter(Boolean);

export function parseChecklistItems(value: unknown): ChecklistItem[] {
  return asArray(value)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const tipo = asTipo(row.tipo);
      const opcoes = asStrings(row.opcoesProblema);
      return {
        chave: String(row.chave ?? ""),
        ordem: Number(row.ordem ?? 0) || 0,
        rotulo: String(row.rotulo ?? ""),
        instrucao: String(row.instrucao ?? ""),
        tipo,
        obrigatorio: row.obrigatorio === true,
        unidade: String(row.unidade ?? ""),
        opcoesProblema: tipo === "okNok" ? (opcoes.length ? opcoes : [...CHECKLIST_PROBLEMAS_PADRAO]) : []
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
      problemas: asStrings(row.problemas),
      observacao: String(row.observacao ?? ""),
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
    entreguePorNome: String(row["_new_entreguepor_value@OData.Community.Display.V1.FormattedValue"] ?? ""),
    trocaDetectadaEm: row.new_trocadetectadaem ? String(row.new_trocadetectadaem) : null,
    solicitadoEm: String(row.new_solicitadoem ?? row.createdon ?? ""),
    concluidoEm: row.new_concluidoem ? String(row.new_concluidoem) : null,
    odometro: Number.isFinite(odometro) ? odometro : null,
    itens: parseChecklistItems(row.new_itensjson),
    respostas: parseChecklistRespostas(row.new_respostasjson)
  };
}

export const isChecklistPending = (item: ChecklistVeiculo) => item.estado === CHECKLIST_ESTADO.pendente;

// Texto do card na agenda (Serviços). A troca diz de quem o carro veio.
export function checklistCardTexto(item: ChecklistVeiculo) {
  const placa = item.placa ? `Veículo ${item.placa}` : "Vistoria do veículo";
  if (!isChecklistPending(item)) return { label: "CHECKLIST ENVIADO", descricao: placa };
  if (item.origem === CHECKLIST_ORIGEM.troca) {
    return { label: "RECEBIMENTO DO CARRO", descricao: `${placa} · ${item.entreguePorNome ? `entregue por ${item.entreguePorNome}` : "entregue por: não identificado"}` };
  }
  return { label: item.origem === CHECKLIST_ORIGEM.manual ? "SOLICITADO PELA OPERAÇÃO" : "VISTORIA QUINZENAL", descricao: placa };
}

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
  const sugeridos: string[] = [];
  // Hodômetro sincronizado da Infleet sugere o KM; o motorista confere e corrige.
  if (checklist.odometro != null) {
    for (const item of checklist.itens) {
      if (!isOdometerItem(item)) continue;
      valores[item.chave] = String(Math.round(checklist.odometro));
      sugeridos.push(item.chave);
    }
  }
  return { checklistId: checklist.id, valores, fotos: {}, sugeridos, updatedAt: new Date().toISOString() };
}

// Valor digitado pelo motorista: deixa de ser sugestão e passa a contar no progresso.
export function setChecklistValor(draft: ChecklistDraft, chave: string, valor: string): ChecklistDraft {
  const next: ChecklistDraft = { ...draft, valores: { ...draft.valores, [chave]: valor }, updatedAt: new Date().toISOString() };
  if (draft.sugeridos?.includes(chave)) next.sugeridos = draft.sugeridos.filter((key) => key !== chave);
  return next;
}

export function setChecklistOkNok(draft: ChecklistDraft, chave: string, valor: "ok" | "nok"): ChecklistDraft {
  const next: ChecklistDraft = { ...draft, valores: { ...draft.valores, [chave]: valor }, updatedAt: new Date().toISOString() };
  if (valor === "nok") return next;
  return {
    ...next,
    fotos: { ...draft.fotos, [chave]: [] },
    problemas: { ...(draft.problemas ?? {}), [chave]: [] },
    observacoes: { ...(draft.observacoes ?? {}), [chave]: "" }
  };
}

// Itens cujas fotos entram na fila de envio: fotos puras e okNok marcado como Não OK.
export const checklistPhotoItems = (itens: ChecklistItem[], draft: ChecklistDraft) =>
  itens.filter((item) => item.tipo === "foto" || (item.tipo === "okNok" && draft.valores[item.chave] === "nok"));

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
    } else if (item.tipo === "okNok") {
      if (valor !== "ok" && valor !== "nok") { if (item.obrigatorio) errors[item.chave] = "Escolha OK ou Não OK."; }
      else if (valor === "nok") {
        if (fotos.length === 0) errors[item.chave] = "Tire a foto do problema.";
        else if (fotos.length > CHECKLIST_MAX_FOTOS_POR_ITEM) errors[item.chave] = `Envie até ${CHECKLIST_MAX_FOTOS_POR_ITEM} fotos.`;
        else if (!(draft.problemas?.[item.chave] ?? []).length) errors[item.chave] = "Escolha o problema.";
        else if (new Set(draft.problemas?.[item.chave]).size > CHECKLIST_MAX_PROBLEMAS) errors[item.chave] = `Escolha até ${CHECKLIST_MAX_PROBLEMAS} problemas.`;
        else if ((draft.observacoes?.[item.chave] ?? "").trim().length > CHECKLIST_MAX_OBSERVACAO) errors[item.chave] = `Use até ${CHECKLIST_MAX_OBSERVACAO} caracteres.`;
      }
    } else {
      if (valor.trim().length > CHECKLIST_MAX_TEXTO) errors[item.chave] = `Use até ${CHECKLIST_MAX_TEXTO} caracteres.`;
      else if (item.obrigatorio && !valor.trim()) errors[item.chave] = "Preencha este campo.";
    }
  }
  return errors;
}

// Marca ou desmarca um problema do Não OK. Desmarcar é sempre livre; marcar além do limite é recusado e devolve o aviso.
export function toggleChecklistProblema(draft: ChecklistDraft, chave: string, problema: string): { draft: ChecklistDraft; erro?: string } {
  const atual = draft.problemas?.[chave] ?? [];
  if (!atual.includes(problema) && atual.length >= CHECKLIST_MAX_PROBLEMAS) return { draft, erro: `Escolha até ${CHECKLIST_MAX_PROBLEMAS} problemas.` };
  const next = atual.includes(problema) ? atual.filter((entry) => entry !== problema) : [...atual, problema];
  return { draft: { ...draft, problemas: { ...(draft.problemas ?? {}), [chave]: next } } };
}

// Não OK só conta como preenchido com ao menos uma foto e um problema.
const isChecklistItemDone = (item: ChecklistItem, draft: ChecklistDraft) => {
  if (draft.sugeridos?.includes(item.chave)) return false;
  if (item.tipo === "foto") return (draft.fotos[item.chave] ?? []).length > 0;
  const valor = (draft.valores[item.chave] ?? "").trim();
  if (item.tipo === "okNok" && valor === "nok") return (draft.fotos[item.chave] ?? []).length > 0 && (draft.problemas?.[item.chave] ?? []).length > 0;
  return Boolean(valor);
};

export function countChecklistProgress(itens: ChecklistItem[], draft: ChecklistDraft) {
  return { done: itens.filter((item) => isChecklistItemDone(item, draft)).length, total: itens.length };
}

// Mesmo formato que ChecklistAnswers.Validate espera: [{ chave, valor, fotos: [{ link, caminho, nomeArquivo }] }].
export function buildChecklistRespostasJson(itens: ChecklistItem[], draft: ChecklistDraft, uploaded: Record<string, ChecklistFotoEnviada[]>) {
  return JSON.stringify(itens.map((item) => {
    if (item.tipo === "foto") return { chave: item.chave, fotos: uploaded[item.chave] ?? [] };
    if (item.tipo === "okNok") {
      const escolha = draft.valores[item.chave] ?? "";
      if (escolha !== "nok") return { chave: item.chave, valor: escolha };
      return {
        chave: item.chave, valor: escolha,
        problemas: [...new Set(draft.problemas?.[item.chave] ?? [])],
        observacao: (draft.observacoes?.[item.chave] ?? "").trim(),
        fotos: uploaded[item.chave] ?? []
      };
    }
    const valor = draft.valores[item.chave] ?? "";
    return { chave: item.chave, valor: item.tipo === "numero" ? normalizeChecklistNumber(valor) ?? "" : valor.trim() };
  }));
}

// ---------- Mock local (localhost) ----------

const MOCK_DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const mockItens = (): ChecklistItem[] => [
  { chave: "a0000000-0000-4000-8000-000000000001", ordem: 1, rotulo: "Frente do veículo", instrucao: "Enquadre o carro inteiro, com a placa legível.", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000002", ordem: 2, rotulo: "Traseira do veículo", instrucao: "Enquadre o carro inteiro, com a placa legível.", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000003", ordem: 3, rotulo: "Lateral esquerda", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000004", ordem: 4, rotulo: "Lateral direita", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000005", ordem: 5, rotulo: "Painel ligado", instrucao: "Mostre o hodômetro e o nível de combustível.", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000006", ordem: 6, rotulo: "Quilometragem", instrucao: "Confira o número do painel.", tipo: "numero", obrigatorio: true, unidade: "km", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000007", ordem: 7, rotulo: "Combustível", instrucao: "Nível aproximado do tanque.", tipo: "numero", obrigatorio: false, unidade: "%", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000008", ordem: 8, rotulo: "Observações", instrucao: "Avarias, limpeza, itens faltando ou o que mais a operação precisa saber.", tipo: "texto", obrigatorio: false, unidade: "", opcoesProblema: [] },
  { chave: "a0000000-0000-4000-8000-000000000009", ordem: 9, rotulo: "Pneus", instrucao: "Confira calibragem e desgaste.", tipo: "okNok", obrigatorio: true, unidade: "", opcoesProblema: ["Murcho", "Careca", "Furado", "Outro"] }
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
      estado: CHECKLIST_ESTADO.pendente, origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "Carlos Andrade", trocaDetectadaEm: iso(0), solicitadoEm: iso(0), concluidoEm: null, odometro: 45210, itens, respostas: []
    },
    {
      id: "c0000000-0000-4000-8000-000000000002", nome: "Checklist ABC1D23 - anterior", motoristaId: MOCK_DRIVER_ID, veiculoId: "v1", placa: "ABC1D23",
      estado: CHECKLIST_ESTADO.concluido, origem: CHECKLIST_ORIGEM.quinzenal, entreguePorNome: "", trocaDetectadaEm: null, solicitadoEm: iso(15), concluidoEm: iso(14), odometro: 44100, itens,
      respostas: itens.map((item) => ({
        chave: item.chave, rotulo: item.rotulo, tipo: item.tipo,
        valor: item.tipo === "numero" ? (item.unidade === "km" ? "44102" : "75") : item.tipo === "texto" ? "Sem avarias." : item.tipo === "okNok" ? "ok" : "",
        problemas: [], observacao: "",
        fotos: item.tipo === "foto" ? [{ link: "https://example.com/mock-foto.jpg", caminho: "Checklists/mock", nomeArquivo: `${item.rotulo}.jpg` }] : []
      }))
    }
  ];
  return localMock;
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------- Leitura ----------

const CHECKLIST_SELECT = "$select=new_checklistveiculoid,new_name,_new_motorista_value,_new_veiculo_value,new_estado,new_origem,_new_entreguepor_value,new_trocadetectadaem,new_solicitadoem,new_concluidoem,new_odometroinfleet,new_itensjson,new_respostasjson,createdon";

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
    if (mockChecklistFailure() === "registro") throw new Error("Sem conexão para registrar o checklist.");
    const row = getLocalMock().find((item) => item.id === cleanId);
    if (!row) throw new Error("Checklist não encontrado.");
    if (row.estado === CHECKLIST_ESTADO.concluido) return;
    const respostas = (JSON.parse(respostasJson) as { chave: string; valor?: string; problemas?: string[]; observacao?: string; fotos?: ChecklistFotoEnviada[] }[]);
    row.respostas = row.itens.map((item) => {
      const answer = respostas.find((entry) => entry.chave === item.chave);
      return { chave: item.chave, rotulo: item.rotulo, tipo: item.tipo, valor: answer?.valor ?? "", problemas: answer?.problemas ?? [], observacao: answer?.observacao ?? "", fotos: answer?.fotos ?? [] };
    });
    row.estado = CHECKLIST_ESTADO.concluido;
    row.concluidoEm = new Date().toISOString();
    return;
  }
  await executeChecklistAction("new_ConcluirChecklistVeiculo", { new_ChecklistId: cleanId, new_RespostasJson: respostasJson });
}

export async function uploadChecklistPhotoMock(fileName: string): Promise<ChecklistFotoEnviada> {
  await delay(250);
  mockPhotoUploads += 1;
  if (mockChecklistFailure() === "foto" && mockPhotoUploads % 2 === 0) throw new Error("Sem conexão para enviar a foto.");
  return { link: `https://example.com/mock/${encodeURIComponent(fileName)}`, caminho: "Checklists/DEV/mock", nomeArquivo: fileName };
}
