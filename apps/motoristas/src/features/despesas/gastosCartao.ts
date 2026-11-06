import { cleanGuid, GUID_PATTERN } from "../comunicados/comunicados.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { retrieveMultiple } from "../../data/dataverse/cliente.ts";
import { normalizeExpenseFields } from "./expenses.reference.ts";
import type { ExpenseCityOption, ExpenseDraft, ExpenseLookupNavigationNames, ExpensePhoto, ExpenseReferenceData } from "./expenses.types.ts";

// Gastos do cartão corporativo que o flow diário cria no lugar do motorista (Banco MCP -> cr40f_despesaoperacional).
// O motorista só completa: descrição, categoria, cidade e comprovante. Valor, data, forma e estabelecimento vêm do banco.
// Choices reais do DEV (cr40f_origem, cr40f_statusoperacional).
export const ORIGEM_FLOW = 100000002;
export const STATUS_OPERACIONAL = { enviado: 100000000, precisaCorrigir: 100000001 } as const;
const STATUS_ANEXO = { semAnexo: 100000000, enviando: 100000001 } as const;

export type GastoCartao = {
  id: string;
  nome: string;
  valor: number;
  /** `AAAA-MM-DD` */
  dataGasto: string;
  estabelecimento: string;
  /** Final do cartão lido de `cr40f_nome` ("Cartão final 1234 · Posto"); vazio se o nome não trouxer. */
  cartaoFinal: string;
  categoriaId: string;
  formaPagamentoId: string;
  cidadeId: string;
  veiculoId: string;
  descricao: string;
  kmInformado: number | null;
  litros: number | null;
};

export type GastosCartaoLoadStatus = "loading" | "ready" | "error";

export const isMockGastosCartao = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

const GASTO_SELECT = "$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_valor,cr40f_datagasto,cr40f_estabelecimento,cr40f_observacao,cr40f_kminformado,cr40f_litros,_cr40f_categoria_value,_cr40f_formapagamento_value,_cr40f_cidade_value,_cr40f_veiculo_value";

/** Despesas do motorista logado (lookup do funcionário) criadas pelo flow do cartão e ainda sem correção. */
export function filtroGastosCartaoPendentes(motoristaId: string) {
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para carregar gastos do cartão.");
  return `_cr40f_motorista_value eq ${id} and cr40f_conciliadacartao eq true and cr40f_origem eq ${ORIGEM_FLOW} and cr40f_statusoperacional eq ${STATUS_OPERACIONAL.precisaCorrigir} and statecode eq 0`;
}

export function cartaoFinalDoNome(nome: string) {
  return /final\s+(\d{2,4})/i.exec(nome)?.[1] ?? "";
}

type Row = Record<string, unknown>;
const text = (value: unknown) => (value == null ? "" : String(value));
const lookup = (value: unknown) => cleanGuid(text(value)).toLowerCase();
const numberOrNull = (value: unknown) => (value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

export function mapGastoCartao(row: Row): GastoCartao {
  const nome = text(row.cr40f_nome);
  return {
    id: lookup(row.cr40f_despesaoperacionalid),
    nome,
    valor: Number(row.cr40f_valor) || 0,
    dataGasto: text(row.cr40f_datagasto).slice(0, 10),
    estabelecimento: text(row.cr40f_estabelecimento),
    cartaoFinal: cartaoFinalDoNome(nome),
    categoriaId: lookup(row._cr40f_categoria_value),
    formaPagamentoId: lookup(row._cr40f_formapagamento_value),
    cidadeId: lookup(row._cr40f_cidade_value),
    veiculoId: lookup(row._cr40f_veiculo_value),
    descricao: text(row.cr40f_observacao),
    kmInformado: numberOrNull(row.cr40f_kminformado),
    litros: numberOrNull(row.cr40f_litros)
  };
}

/** Mesma regra do filtro do servidor; usada no mock e para não exibir o que já foi enviado. */
export function isGastoCartaoPendenteRow(row: Row, motoristaId: string) {
  return lookup(row._cr40f_motorista_value) === cleanGuid(motoristaId).toLowerCase()
    && row.cr40f_conciliadacartao === true
    && Number(row.cr40f_origem) === ORIGEM_FLOW
    && Number(row.cr40f_statusoperacional) === STATUS_OPERACIONAL.precisaCorrigir
    && Number(row.statecode ?? 0) === 0;
}

export function ordenarPorData(items: GastoCartao[]) {
  return [...items].sort((a, b) => a.dataGasto.localeCompare(b.dataGasto) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------------- Mock local (localhost) ----------------

const MOCK_MOTORISTA = "00000000-0000-4000-8000-0000000000aa";
const mockParam = (name: string) => new URLSearchParams(window.location.search).get(name);
const mockDelay = () => new Promise((resolve) => setTimeout(resolve, 300));

export const MOCK_CIDADES: ExpenseCityOption[] = [
  { id: "mock-sjc", name: "São José dos Campos", uf: "SP", pais: "Brasil", codigoIbge: "3549904", order: 1 },
  { id: "mock-sp", name: "São Paulo", uf: "SP", pais: "Brasil", codigoIbge: "3550308", order: 2 },
  { id: "mock-rj", name: "Rio de Janeiro", uf: "RJ", pais: "Brasil", codigoIbge: "3304557", order: 3 }
];

function mockRow(id: string, nome: string, valor: number, dia: string, estabelecimento: string, categoriaId: string): Row {
  return {
    cr40f_despesaoperacionalid: id, cr40f_nome: nome, cr40f_valor: valor, cr40f_datagasto: `${dia}T12:00:00Z`, cr40f_estabelecimento: estabelecimento,
    cr40f_observacao: "Informe a descrição do gasto e anexe o comprovante.",
    _cr40f_motorista_value: MOCK_MOTORISTA, _cr40f_categoria_value: categoriaId, _cr40f_formapagamento_value: "local-cartao-credito",
    cr40f_conciliadacartao: true, cr40f_origem: ORIGEM_FLOW, cr40f_statusoperacional: STATUS_OPERACIONAL.precisaCorrigir, statecode: 0
  };
}

let mockRows: Row[] | null = null;
function getMockRows() {
  mockRows ??= [
    mockRow("a1111111-1111-4111-8111-111111111111", "Cartão final 4821 · Posto Ipiranga Dutra", 245.9, "2026-11-02", "Posto Ipiranga Dutra", "local-abastecimento"),
    mockRow("a2222222-2222-4222-8222-222222222222", "Cartão final 4821 · Estacionamento Aeroporto GRU", 58, "2026-11-03", "Estacionamento Aeroporto GRU", "local-estacionamento"),
    mockRow("a3333333-3333-4333-8333-333333333333", "Cartão final 4821 · Restaurante Fogo de Chão", 132.4, "2026-11-03", "Restaurante Fogo de Chão", "local-outros")
  ];
  return mockRows;
}

/** Tira o gasto do mock depois de completar (o servidor muda o status para Enviado). */
export function concluirGastoCartaoMock(id: string) {
  const row = getMockRows().find((item) => lookup(item.cr40f_despesaoperacionalid) === id);
  if (row) row.cr40f_statusoperacional = STATUS_OPERACIONAL.enviado;
}

export async function listarGastosCartao(motoristaId: string): Promise<GastoCartao[]> {
  if (isMockGastosCartao()) {
    await mockDelay();
    const modo = mockParam("mockGastosCartao");
    if (modo === "erro") throw new Error("Falha simulada ao carregar gastos do cartão.");
    if (modo === "vazio") return [];
    return ordenarPorData(getMockRows().filter((row) => isGastoCartaoPendenteRow(row, MOCK_MOTORISTA)).map(mapGastoCartao));
  }
  const result = await retrieveMultiple(DATAVERSE.despesasOperacionais, `${GASTO_SELECT}&$filter=${filtroGastosCartaoPendentes(motoristaId)}&$orderby=cr40f_datagasto asc`);
  return ordenarPorData(result.entities.map((row) => mapGastoCartao(row as Row)));
}

// ---------------- Formulário e PATCH ----------------

/** Rascunho do formulário "Registrar gasto" já preenchido com o que veio do banco. */
export function gastoCartaoParaRascunho(gasto: GastoCartao): ExpenseDraft {
  return {
    categoriaId: gasto.categoriaId,
    veiculoId: gasto.veiculoId,
    valor: gasto.valor.toFixed(2).replace(".", ","),
    dataGasto: gasto.dataGasto,
    formaPagamentoId: gasto.formaPagamentoId,
    cidadeId: gasto.cidadeId,
    estabelecimento: gasto.estabelecimento,
    // O texto do flow pede descrição e comprovante; o motorista escreve a própria.
    descricao: "",
    kmInformado: gasto.kmInformado ? String(gasto.kmInformado) : "",
    litros: gasto.litros ? String(gasto.litros).replace(".", ",") : ""
  };
}

/** Ao abrir um pendente com formulário já preenchido (aviso de duplicidade), mantém o que o motorista digitou. */
export function mesclarRascunho(base: ExpenseDraft, digitado: ExpenseDraft): ExpenseDraft {
  return {
    ...base,
    categoriaId: digitado.categoriaId || base.categoriaId,
    veiculoId: digitado.veiculoId || base.veiculoId,
    cidadeId: digitado.cidadeId || base.cidadeId,
    descricao: digitado.descricao || base.descricao,
    kmInformado: digitado.kmInformado || base.kmInformado,
    litros: digitado.litros || base.litros
  };
}

export function validarDescricao(draft: ExpenseDraft) {
  return draft.descricao.trim() ? "" : "Descreva o gasto.";
}

/**
 * PATCH que completa o gasto existente. Não toca em valor, data, forma, estabelecimento, nome,
 * origem nem `cr40f_conciliadacartao`; muda só o que o motorista informa e o status para Enviado.
 */
export function buildGastoCartaoCompletarPayload({
  draft, photos, referenceData, veiculoId = "", categoryEntitySet, cityEntitySet, veiculoEntitySet, lookupNavigationNames
}: {
  draft: ExpenseDraft;
  /** Veículo atual do motorista, usado quando o formulário não traz um (mesma regra do gasto novo). */
  veiculoId?: string;
  photos: ExpensePhoto[];
  referenceData: ExpenseReferenceData;
  categoryEntitySet: string;
  cityEntitySet: string;
  veiculoEntitySet: string;
  lookupNavigationNames: ExpenseLookupNavigationNames;
}) {
  if (validarDescricao(draft)) throw new Error("Descreva o gasto.");
  const fields = normalizeExpenseFields(draft, photos, referenceData);
  const payload: Record<string, unknown> = {
    cr40f_observacao: fields.descricao ?? "",
    cr40f_statusoperacional: STATUS_OPERACIONAL.enviado,
    cr40f_statusanexo: photos.length ? STATUS_ANEXO.enviando : STATUS_ANEXO.semAnexo,
    [`${lookupNavigationNames.categoria}@odata.bind`]: `/${categoryEntitySet}(${fields.categoria.id})`,
    [`${lookupNavigationNames.cidade}@odata.bind`]: `/${cityEntitySet}(${fields.cidade.id})`
  };
  if (fields.kmInformado) payload.cr40f_kminformado = Math.trunc(fields.kmInformado);
  if (fields.litros) payload.cr40f_litros = fields.litros;
  const vehicleToBind = fields.veiculoId || veiculoId;
  if (vehicleToBind) {
    if (!lookupNavigationNames.veiculo) throw new Error("Navigation property de veículo não resolvido para despesa.");
    payload[`${lookupNavigationNames.veiculo}@odata.bind`] = `/${veiculoEntitySet}(${vehicleToBind})`;
  }
  return payload;
}

// ---------------- Aviso de duplicidade ----------------

const DIA_MS = 86_400_000;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA_MS);

/**
 * Pendente do cartão que provavelmente é o mesmo gasto: mesma forma de pagamento, valor igual (±R$ 0,05)
 * e data informada de 1 dia antes a 2 dias depois da compra (mesma janela do flow diário). Devolve o mais próximo em data.
 */
export function acharGastoCartaoDuplicado(pendentes: GastoCartao[], formaPagamentoId: string, valor: number, dataGasto: string) {
  if (!formaPagamentoId || !Number.isFinite(valor) || valor <= 0 || !dataGasto) return null;
  const candidatos = pendentes
    .filter((gasto) => gasto.formaPagamentoId === formaPagamentoId && Math.abs(gasto.valor - valor) <= 0.05 + 1e-9)
    .map((gasto) => ({ gasto, dias: diasEntre(dataGasto, gasto.dataGasto) }))
    .filter(({ dias }) => dias >= -2 && dias <= 1)
    .sort((a, b) => Math.abs(a.dias) - Math.abs(b.dias));
  return candidatos[0]?.gasto ?? null;
}

export const formatDiaMes = (dataGasto: string) => {
  const [, mes, dia] = dataGasto.split("-");
  return dia && mes ? `${dia}/${mes}` : dataGasto;
};
