import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { updateOne } from "../../data/dataverse/cliente.ts";
import { wait } from "../../shared/wait.ts";
import { loadExpenseLookupNavigationNamesRemote, uploadExpenseInvoiceRemote } from "./remoto.ts";
import { bind } from "../../data/dataverse/registros.ts";
import { findExpenseCategoryByName, findExpenseCategory, getExpenseCategoryRules, parseDecimalInput, parseIntegerInput } from "./expenses.reference.ts";
import { toDataverseDate } from "./expenses.payload.ts";
import type { ExpenseLookupNavigationNames, ExpenseReferenceData } from "./expenses.types.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";
import { STATUS_DESPESA, ehDevolvidaParaAcao, type DespesaRelatorio } from "./gastosRelatorio.ts";

// Despesa devolvida: o motorista vê o motivo, troca o comprovante e/ou explica, e reenvia para nova conferência.
// Colunas (spec de 10/11/2026, Betinhos-Sistema): new_motivodevolucao, new_justificativamotorista, new_aguardandogestor.
// O valor da despesa fica travado: nada aqui altera cr40f_valor.
// O motorista também pode corrigir categoria, veículo, km, litros, data e forma de pagamento, ou cancelar o lançamento em dobro.

export const MIN_EXPLICACAO = 10;
/** cr40f_statusanexo = Completo. */
export const ANEXO_COMPLETO = 100000002;
export const MOTIVO_PADRAO = "O financeiro pediu uma conferência neste gasto. Troque o comprovante ou explique o que aconteceu.";

type CamposDevolucao = Pick<DespesaRelatorio, "status" | "aguardandoGestor" | "motivoDevolucao" | "iaMotivos" | "justificativa">;

/** "acao": motorista deve agir. "gestor": a dúvida está com o gestor. "conferencia": reenviada, aguardando a análise. */
export type EstadoDevolucao = "acao" | "gestor" | "conferencia";

/** Motivo para o motorista: o da devolução; se vazio, o da análise da IA; se também vazio, texto padrão. */
export function motivoParaMotorista(d: Pick<DespesaRelatorio, "motivoDevolucao" | "iaMotivos">) {
  return d.motivoDevolucao.trim() || d.iaMotivos.trim();
}

export function estadoDevolucao(d: CamposDevolucao): EstadoDevolucao | null {
  const emAberto = d.status === STATUS_DESPESA.precisaCorrigir || d.status === STATUS_DESPESA.enviado;
  if (d.aguardandoGestor && emAberto) return "gestor";
  if (ehDevolvidaParaAcao(d)) return "acao";
  // Reenviada: voltou a "Enviado" e ainda guarda o motivo da devolução ou a explicação do motorista.
  if (d.status === STATUS_DESPESA.enviado && (motivoParaMotorista(d) || d.justificativa.trim())) return "conferencia";
  return null;
}

export const SELO_DEVOLUCAO: Record<EstadoDevolucao, { rotulo: string; tom: string }> = {
  acao: { rotulo: "Precisa da sua ação", tom: "atencao" },
  gestor: { rotulo: "Com o gestor", tom: "neutro" },
  conferencia: { rotulo: "Em conferência", tom: "neutro" }
};

// ---------------- Validação ----------------

export type ValidacaoEnvio = { pode: boolean; erro: string };

/** Pelo menos uma ação (foto nova, campo corrigido ou explicação). Explicação de 1 a 9 caracteres não passa; em branco vale como "só a foto" ou "só a correção". */
export function validarEnvio({ explicacao, temFoto, temAlteracao = false }: { explicacao: string; temFoto: boolean; temAlteracao?: boolean }): ValidacaoEnvio {
  const tamanho = explicacao.trim().length;
  if (tamanho > 0 && tamanho < MIN_EXPLICACAO) return { pode: false, erro: `Conte um pouco mais: mínimo de ${MIN_EXPLICACAO} caracteres.` };
  return { pode: tamanho > 0 || temFoto || temAlteracao, erro: "" };
}

// ---------------- Campos corrigidos pelo motorista ----------------

/** Campos editáveis (o valor não está aqui de propósito). Textos como no formulário de lançamento: km inteiro, litros com vírgula. */
export type EdicaoDespesa = { categoriaId: string; veiculoId: string; kmInformado: string; litros: string; dataGasto: string; formaPagamentoId: string };
export type CampoEdicao = keyof EdicaoDespesa;
export type ErrosEdicao = Partial<Record<CampoEdicao, string>>;

const mesmoId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Lançamento atual da despesa. A categoria vem só pelo nome na consulta do relatório, então se resolve pelo nome. */
export function edicaoInicial(despesa: DespesaRelatorio, referenceData: ExpenseReferenceData): EdicaoDespesa {
  const forma = referenceData.paymentMethods.find((item) => mesmoId(item.id, despesa.formaPagamentoId));
  return {
    categoriaId: findExpenseCategoryByName(referenceData, [despesa.categoria])?.id ?? "",
    veiculoId: despesa.veiculoId,
    kmInformado: despesa.km ? String(Math.trunc(despesa.km)) : "",
    litros: despesa.litros ? String(despesa.litros).replace(".", ",") : "",
    dataGasto: despesa.data,
    formaPagamentoId: forma?.id ?? despesa.formaPagamentoId
  };
}

/** Campos que mudaram. Veículo, km e litros só contam quando a categoria atual os pede (como no lançamento, que os limpa ao trocar de categoria). */
export function camposAlterados(inicial: EdicaoDespesa, atual: EdicaoDespesa, referenceData: ExpenseReferenceData): CampoEdicao[] {
  const regras = getExpenseCategoryRules(findExpenseCategory(referenceData, atual.categoriaId));
  const mudou: CampoEdicao[] = [];
  if (!mesmoId(inicial.categoriaId, atual.categoriaId)) mudou.push("categoriaId");
  if (inicial.dataGasto !== atual.dataGasto) mudou.push("dataGasto");
  if (!mesmoId(inicial.formaPagamentoId, atual.formaPagamentoId)) mudou.push("formaPagamentoId");
  if (regras.exigeVeiculo && !mesmoId(inicial.veiculoId, atual.veiculoId)) mudou.push("veiculoId");
  if (regras.exigeKm && parseIntegerInput(inicial.kmInformado) !== parseIntegerInput(atual.kmInformado)) mudou.push("kmInformado");
  if (regras.exigeLitros && parseDecimalInput(inicial.litros) !== parseDecimalInput(atual.litros)) mudou.push("litros");
  return mudou;
}

/** Mesmas regras do lançamento, só para o que foi mexido (trocar a categoria confere tudo o que ela pede). */
export function validarEdicao(inicial: EdicaoDespesa, atual: EdicaoDespesa, referenceData: ExpenseReferenceData): ErrosEdicao {
  const mudou = new Set(camposAlterados(inicial, atual, referenceData));
  const erros: ErrosEdicao = {};
  const categoria = findExpenseCategory(referenceData, atual.categoriaId);
  const regras = getExpenseCategoryRules(categoria);
  const confere = (campo: CampoEdicao) => mudou.has(campo) || mudou.has("categoriaId");
  if (mudou.has("categoriaId") && !categoria) erros.categoriaId = "Selecione a categoria.";
  if (mudou.has("dataGasto") && !atual.dataGasto) erros.dataGasto = "Informe a data do gasto.";
  if (mudou.has("formaPagamentoId") && !referenceData.paymentMethods.some((item) => item.id === atual.formaPagamentoId)) erros.formaPagamentoId = "Selecione a forma de pagamento.";
  if (regras.exigeVeiculo && confere("veiculoId") && !atual.veiculoId.trim()) erros.veiculoId = "Selecione o veículo.";
  if (regras.exigeKm && confere("kmInformado") && parseIntegerInput(atual.kmInformado) <= 0) erros.kmInformado = "Informe o KM.";
  if (regras.exigeLitros && confere("litros") && parseDecimalInput(atual.litros) <= 0) erros.litros = "Informe os litros.";
  return erros;
}

/** O mesmo que foi enviado, no formato da lista: o relatório mostra os dados novos na hora, sem esperar a releitura. */
export function alteracoesParaLista(inicial: EdicaoDespesa, atual: EdicaoDespesa, referenceData: ExpenseReferenceData): Partial<DespesaRelatorio> {
  const mudou = new Set(camposAlterados(inicial, atual, referenceData));
  return {
    ...(mudou.has("categoriaId") ? { categoria: findExpenseCategory(referenceData, atual.categoriaId)?.name ?? "" } : {}),
    ...(mudou.has("dataGasto") ? { data: atual.dataGasto } : {}),
    ...(mudou.has("formaPagamentoId") ? { formaPagamentoId: atual.formaPagamentoId } : {}),
    ...(mudou.has("veiculoId") ? { veiculoId: atual.veiculoId.toLowerCase() } : {}),
    ...(mudou.has("kmInformado") ? { km: parseIntegerInput(atual.kmInformado) } : {}),
    ...(mudou.has("litros") ? { litros: parseDecimalInput(atual.litros) } : {})
  };
}

/** Só o que mudou, com os mesmos nomes lógicos e lookups do lançamento (expenses.payload.ts). Nunca leva `cr40f_valor`. */
export function buildCamposEditados(inicial: EdicaoDespesa, atual: EdicaoDespesa, referenceData: ExpenseReferenceData, nomes: Partial<ExpenseLookupNavigationNames> = {}) {
  const mudou = new Set(camposAlterados(inicial, atual, referenceData));
  const campos: Record<string, unknown> = {};
  const nome = (chave: "categoria" | "formaPagamento" | "veiculo") => {
    const valor = nomes[chave];
    if (!valor) throw new Error(`Navigation property de ${chave} não resolvido para despesa.`);
    return `${valor}@odata.bind`;
  };
  if (mudou.has("categoriaId")) campos[nome("categoria")] = bind(DATAVERSE.categoriasDespesasOperacionais, atual.categoriaId);
  if (mudou.has("formaPagamentoId")) campos[nome("formaPagamento")] = bind(DATAVERSE.formasPagamentoDespesas, atual.formaPagamentoId);
  if (mudou.has("veiculoId")) campos[nome("veiculo")] = bind(DATAVERSE.veiculos, atual.veiculoId);
  if (mudou.has("dataGasto")) campos.cr40f_datagasto = toDataverseDate(atual.dataGasto);
  if (mudou.has("kmInformado")) campos.cr40f_kminformado = parseIntegerInput(atual.kmInformado);
  if (mudou.has("litros")) campos.cr40f_litros = parseDecimalInput(atual.litros);
  // Categoria nova que não pede km ou litros: limpa o que ficou da anterior, como o lançamento faz.
  if (mudou.has("categoriaId")) {
    const regras = getExpenseCategoryRules(findExpenseCategory(referenceData, atual.categoriaId));
    if (!regras.exigeKm) campos.cr40f_kminformado = null;
    if (!regras.exigeLitros) campos.cr40f_litros = null;
  }
  return campos;
}

// ---------------- Payload e envio ----------------

/** Um único PATCH: campos corrigidos, explicação (se houver), status Enviado e anexo Completo (dispara a nova análise, mesmo sem foto nova). */
export function buildDevolucaoPayload(explicacao: string, camposEditados: Record<string, unknown> = {}) {
  const texto = explicacao.trim();
  return {
    ...camposEditados,
    ...(texto ? { new_justificativamotorista: texto } : {}),
    cr40f_statusoperacional: STATUS_DESPESA.enviado,
    cr40f_statusanexo: ANEXO_COMPLETO
  } as Record<string, unknown>;
}

/** "Lancei em dobro": só o status Cancelado. Sem anexo Completo nem explicação, então a análise da IA não dispara e o gestor não vê. */
export function buildCancelamentoPayload(): Record<string, unknown> {
  return { cr40f_statusoperacional: STATUS_DESPESA.cancelado };
}

export type FotoNova = { dataUrl: string; fileName: string };
/** Guarda o que já foi feito entre tentativas: numa nova tentativa o comprovante não sobe de novo. */
export type ProgressoEnvio = { anexado: boolean };
export type DependenciasEnvio = {
  subirComprovante: (foto: FotoNova) => Promise<void>;
  atualizarDespesa: (payload: Record<string, unknown>) => Promise<void>;
  /** Nomes das navigation properties dos lookups; só é chamado quando há categoria, forma de pagamento ou veículo corrigidos. */
  carregarNomesLookup?: (incluiVeiculo: boolean) => Promise<ExpenseLookupNavigationNames>;
};
export type EdicaoEnvio = { inicial: EdicaoDespesa; atual: EdicaoDespesa; referenceData: ExpenseReferenceData };

/** Comprovante primeiro (a IA analisa já com o arquivo novo) e depois o PATCH. Qualquer falha propaga; o chamador mantém o texto. */
export async function enviarDevolucao(
  entrada: { explicacao: string; foto: FotoNova | null; progresso: ProgressoEnvio; edicao?: EdicaoEnvio | null },
  deps: DependenciasEnvio
) {
  const { explicacao, foto, progresso, edicao } = entrada;
  // Os nomes dos lookups saem antes do comprovante: sem sinal, falha cedo e nada fica pela metade.
  let campos: Record<string, unknown> = {};
  if (edicao) {
    const mudou = camposAlterados(edicao.inicial, edicao.atual, edicao.referenceData);
    const usaLookup = mudou.some((campo) => campo === "categoriaId" || campo === "formaPagamentoId" || campo === "veiculoId");
    const nomes = usaLookup ? await deps.carregarNomesLookup?.(mudou.includes("veiculoId")) : undefined;
    campos = buildCamposEditados(edicao.inicial, edicao.atual, edicao.referenceData, nomes);
  }
  if (foto && !progresso.anexado) {
    await deps.subirComprovante(foto);
    progresso.anexado = true;
  }
  await deps.atualizarDespesa(buildDevolucaoPayload(explicacao, campos));
}

/** Lançada em dobro: cancela na hora, sem foto nem reanálise. */
export async function cancelarEmDobro(deps: Pick<DependenciasEnvio, "atualizarDespesa">) {
  await deps.atualizarDespesa(buildCancelamentoPayload());
}

/** Dependências reais (Dataverse). `ordem` = próxima posição do comprovante, depois dos que já existem. */
export function dependenciasRemotas({ despesaId, nome, motoristaId, ordem }: { despesaId: string; nome: string; motoristaId: string; ordem: number }): DependenciasEnvio {
  return {
    async subirComprovante(foto) {
      if (isMockGastosCartao()) return simularRede();
      await uploadExpenseInvoiceRemote({ expenseId: despesaId, expenseName: nome || despesaId, motoristaId, dataUrl: foto.dataUrl, fileName: foto.fileName, order: ordem });
    },
    async atualizarDespesa(payload) {
      if (isMockGastosCartao()) return simularRede();
      await updateOne(DATAVERSE.despesasOperacionais, despesaId, payload);
    },
    async carregarNomesLookup(incluiVeiculo) {
      if (isMockGastosCartao()) return { motorista: "cr40f_motorista", categoria: "cr40f_categoria", formaPagamento: "cr40f_formapagamento", cidade: "cr40f_cidade", veiculo: "cr40f_veiculo" };
      return loadExpenseLookupNavigationNamesRemote({ includeVeiculo: incluiVeiculo });
    }
  };
}

/** No mock, `?mockEnvioDevolucao=erro` simula falha de rede (para ver o texto preservado). */
async function simularRede() {
  await wait(500);
  if (new URLSearchParams(window.location.search).get("mockEnvioDevolucao") === "erro") throw new Error("Falha simulada de rede.");
}

// ---------------- Rascunho da explicação ----------------

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const chaveRascunho = (despesaId: string) => `app-motoristas:devolucao:${despesaId}`;
const armazenamentoPadrao = (): Armazenamento | null => { try { return window.localStorage; } catch { return null; } };

/** O texto digitado sobrevive a falha de rede, fechar o painel e recarregar o app. */
export function lerRascunho(despesaId: string, armazenamento: Armazenamento | null = armazenamentoPadrao()) {
  try { return armazenamento?.getItem(chaveRascunho(despesaId)) ?? ""; } catch { return ""; }
}

export function guardarRascunho(despesaId: string, texto: string, armazenamento: Armazenamento | null = armazenamentoPadrao()) {
  try {
    if (texto) armazenamento?.setItem(chaveRascunho(despesaId), texto);
    else armazenamento?.removeItem(chaveRascunho(despesaId));
  } catch { /* sem armazenamento: o texto segue só no estado da tela */ }
}
