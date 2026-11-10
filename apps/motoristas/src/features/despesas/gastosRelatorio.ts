import { cleanGuid, GUID_PATTERN } from "../comunicados/comunicados.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { loadExpenseReferenceDataRemote } from "./remoto.ts";
import { retrieveMultipleAll } from "../../data/dataverse/cliente.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA } from "./expenses.defaults.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";

// Relatório de gastos do motorista: números e médias calculados no app (sem IA).
// Colunas de cr40f_despesaoperacional conferidas em expenses.payload.ts, dataverse.ts e gastosCartao.ts.

export const STATUS_DESPESA = { enviado: 100000000, precisaCorrigir: 100000001, validado: 100000002, recusado: 100000003, cancelado: 100000004 } as const;
/** cr40f_statusanexo: 100000000 Sem anexo, 100000003 Falhou (sem comprovante utilizável). */
export const ANEXO_SEM_COMPROVANTE = [100000000, 100000003];
const TIME_ZONE = "America/Sao_Paulo";

export type PeriodoId = "mes" | "mesAnterior" | "3meses";
export const PERIODOS: { id: PeriodoId; rotulo: string }[] = [
  { id: "mes", rotulo: "Mês atual" },
  { id: "mesAnterior", rotulo: "Mês anterior" },
  { id: "3meses", rotulo: "3 meses" }
];

export type DespesaRelatorio = {
  id: string;
  valor: number;
  /** `AAAA-MM-DD` */
  data: string;
  categoria: string;
  formaPagamentoId: string;
  status: number;
  statusAnexo: number | null;
  litros: number | null;
  km: number | null;
  veiculoId: string;
  estabelecimento: string;
  conciliadaCartao: boolean;
  /** Motivo escrito pelo gestor ou pela IA ao devolver (`new_motivodevolucao`). */
  motivoDevolucao: string;
  /** Motivos da análise da IA (`cr40f_iamotivos`); reserva quando `motivoDevolucao` vem vazio. */
  iaMotivos: string;
  /** Explicação do motorista (`new_justificativamotorista`). */
  justificativa: string;
  /** A dúvida do motorista foi para o gestor (`new_aguardandogestor`): sem ação do motorista. */
  aguardandoGestor: boolean;
};

type Periodo = {
  id: PeriodoId;
  rotulo: string;
  /** Datas `AAAA-MM-DD`; `fim` é exclusivo. */
  inicio: string;
  fim: string;
  anteriorInicio: string;
  anteriorFim: string;
  /** Texto de "vs ..." usado nas variações. */
  rotuloAnterior: string;
};

// ---------------- Datas (America/Sao_Paulo) ----------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Data de hoje em São Paulo (`AAAA-MM-DD`), independente do fuso do aparelho. */
export function hojeSaoPaulo(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Primeiro dia do mês de `hoje` deslocado em `meses`. */
function inicioDoMes(hoje: string, meses = 0) {
  const [ano, mes] = hoje.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

export function periodoDe(id: PeriodoId, hoje: string): Periodo {
  const rotulo = PERIODOS.find((item) => item.id === id)?.rotulo ?? id;
  if (id === "3meses") {
    const inicio = inicioDoMes(hoje, -2);
    return { id, rotulo, inicio, fim: inicioDoMes(hoje, 1), anteriorInicio: inicioDoMes(hoje, -5), anteriorFim: inicio, rotuloAnterior: "3 meses anteriores" };
  }
  const deslocamento = id === "mes" ? 0 : -1;
  const inicio = inicioDoMes(hoje, deslocamento);
  return {
    id, rotulo, inicio, fim: inicioDoMes(hoje, deslocamento + 1),
    anteriorInicio: inicioDoMes(hoje, deslocamento - 1), anteriorFim: inicio,
    rotuloAnterior: id === "mes" ? "mês anterior" : "mês retrasado"
  };
}

/** Janela única de busca: cobre qualquer período e o anterior (6 meses até o fim do mês atual). */
function janelaDeBusca(hoje: string) {
  return { inicio: inicioDoMes(hoje, -5), fim: inicioDoMes(hoje, 1) };
}

export const somarDias = (data: string, dias: number) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ---------------- Formatação ----------------

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (valor: number) => BRL.format(valor);

// ---------------- Mapeamento ----------------

type Row = Record<string, unknown>;
const numberOrNull = (value: unknown) => (value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
const texto = (value: unknown) => (value == null ? "" : String(value).trim());
const lookup = (value: unknown) => (value == null ? "" : cleanGuid(String(value)).toLowerCase());

const DESPESA_COLUNAS = "cr40f_despesaoperacionalid,cr40f_valor,cr40f_datagasto,_cr40f_categoria_value,_cr40f_formapagamento_value,_cr40f_veiculo_value,cr40f_statusoperacional,cr40f_statusanexo,cr40f_litros,cr40f_kminformado,cr40f_estabelecimento,cr40f_conciliadacartao";
/** Colunas da devolução (spec de 10/11/2026). Se o ambiente ainda não as tem, a consulta cai para `DESPESA_COLUNAS`. */
const DESPESA_COLUNAS_DEVOLUCAO = "cr40f_iamotivos,new_motivodevolucao,new_justificativamotorista,new_aguardandogestor";

const selectDespesas = (comDevolucao: boolean) => `$select=${DESPESA_COLUNAS}${comDevolucao ? `,${DESPESA_COLUNAS_DEVOLUCAO}` : ""}`;

export function mapDespesaRelatorio(row: Row, nomesCategoria: Map<string, string>): DespesaRelatorio {
  const categoriaId = lookup(row._cr40f_categoria_value);
  return {
    id: lookup(row.cr40f_despesaoperacionalid),
    valor: Number(row.cr40f_valor) || 0,
    data: String(row.cr40f_datagasto ?? "").slice(0, 10),
    categoria: nomesCategoria.get(categoriaId) ?? "Outros",
    formaPagamentoId: lookup(row._cr40f_formapagamento_value),
    status: Number(row.cr40f_statusoperacional),
    statusAnexo: numberOrNull(row.cr40f_statusanexo),
    litros: numberOrNull(row.cr40f_litros),
    km: numberOrNull(row.cr40f_kminformado),
    veiculoId: lookup(row._cr40f_veiculo_value),
    estabelecimento: row.cr40f_estabelecimento == null ? "" : String(row.cr40f_estabelecimento),
    conciliadaCartao: row.cr40f_conciliadacartao === true,
    motivoDevolucao: texto(row.new_motivodevolucao),
    iaMotivos: texto(row.cr40f_iamotivos),
    justificativa: texto(row.new_justificativamotorista),
    aguardandoGestor: row.new_aguardandogestor === true
  };
}

export function filtroDespesasRelatorio(motoristaId: string, hoje: string) {
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para carregar o relatório de gastos.");
  const { inicio, fim } = janelaDeBusca(hoje);
  return `_cr40f_motorista_value eq ${id} and statecode eq 0 and cr40f_datagasto ge ${inicio}T00:00:00Z and cr40f_datagasto lt ${fim}T00:00:00Z`;
}

// ---------------- Agregações puras ----------------

export const norm = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ehCategoria = (despesa: DespesaRelatorio, ...nomes: string[]) => nomes.includes(norm(despesa.categoria));
const soma = (lista: number[]) => lista.reduce((total, valor) => total + valor, 0);

/** Despesas válidas do intervalo `[inicio, fim)`: Cancelado fica de fora de todas as contas. */
export function despesasDoPeriodo(despesas: DespesaRelatorio[], inicio: string, fim: string) {
  return despesas.filter((d) => d.status !== STATUS_DESPESA.cancelado && d.data >= inicio && d.data < fim);
}

/** Soma do valor dos abastecimentos ÷ soma dos litros; ignora abastecimento sem litros. */
export function precoMedioLitro(despesas: DespesaRelatorio[]) {
  const abastecimentos = despesas.filter((d) => ehCategoria(d, "abastecimento") && (d.litros ?? 0) > 0);
  const litros = soma(abastecimentos.map((d) => d.litros ?? 0));
  return litros > 0 ? { valor: soma(abastecimentos.map((d) => d.valor)) / litros, quantidade: abastecimentos.length } : null;
}

/** Valor médio por gasto nas categorias informadas. */
export function mediaPorGasto(despesas: DespesaRelatorio[], ...categorias: string[]) {
  const lista = despesas.filter((d) => ehCategoria(d, ...categorias));
  return lista.length ? { valor: soma(lista.map((d) => d.valor)) / lista.length, quantidade: lista.length } : null;
}

type Media = { valor: number; quantidade: number } | null;
type MediasBrutas = {
  litro: Media; refeicao: Media; cafeLanche: Media;
};

export function calcularMedias(todas: DespesaRelatorio[], inicio: string, fim: string): MediasBrutas {
  const lista = despesasDoPeriodo(todas, inicio, fim);
  return {
    litro: precoMedioLitro(lista),
    refeicao: mediaPorGasto(lista, "almoco", "jantar"),
    cafeLanche: mediaPorGasto(lista, "cafe", "lanche"),
  };
}

/** Variação percentual inteira; null sem base (período anterior vazio ou zero). */
export function variacaoPercentual(atual: number | null | undefined, anterior: number | null | undefined) {
  if (atual == null || anterior == null || !(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

type CartaoMedia = {
  id: "litro" | "refeicao" | "cafeLanche";
  titulo: string;
  valor: number;
  valorTexto: string;
  detalhe: string;
  variacao: number | null;
};

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function montarCartoes(atual: MediasBrutas, anterior: MediasBrutas): CartaoMedia[] {
  const defs: { id: CartaoMedia["id"]; titulo: string; texto: (v: number) => string; detalhe: (n: number) => string }[] = [
    { id: "litro", titulo: "Preço médio por litro", texto: (v) => `${formatBRL(v)}/L`, detalhe: (n) => plural(n, "abastecimento", "abastecimentos") },
    { id: "refeicao", titulo: "Refeição média", texto: formatBRL, detalhe: (n) => `almoço e jantar · ${plural(n, "gasto", "gastos")}` },
    { id: "cafeLanche", titulo: "Café e lanche médio", texto: formatBRL, detalhe: (n) => plural(n, "gasto", "gastos") }
  ];
  return defs.flatMap((def) => {
    const media = atual[def.id];
    if (!media) return [];
    const variacao = variacaoPercentual(media.valor, anterior[def.id]?.valor);
    return [{ id: def.id, titulo: def.titulo, valor: media.valor, valorTexto: def.texto(media.valor), detalhe: def.detalhe(media.quantidade), variacao }];
  });
}

// ---------------- Política de gastos (semáforo) ----------------

/**
 * Política da empresa: R$ 6,10 por litro e R$ 42 por refeição. A tolerância é a faixa amarela acima da meta, menor no
 * combustível (pouca diferença no litro pesa muito no mês). Fixa aqui até a tela do gestor no Sistema Betinhos gravar
 * esses valores no Dataverse; quando existir, só este ponto passa a ler de lá.
 */
export const METAS_GASTOS = {
  litro: { meta: 6.1, tolerancia: 0.02 },
  refeicao: { meta: 42, tolerancia: 0.05 }
} as const;

export type Semaforo = "verde" | "amarelo" | "vermelho";

/** Verde na meta ou abaixo; amarelo até `tolerancia` acima; vermelho além disso. Compara em milésimos para evitar ruído de ponto flutuante. */
export function semaforo(valor: number, { meta, tolerancia }: { meta: number; tolerancia: number }): Semaforo {
  const milesimos = (n: number) => Math.round(n * 1000);
  if (milesimos(valor) <= milesimos(meta)) return "verde";
  return milesimos(valor) <= milesimos(meta * (1 + tolerancia)) ? "amarelo" : "vermelho";
}

/** O que exige ação do motorista: precisa corrigir ou recusado. Com o gestor (`aguardandoGestor`) não há o que o motorista faça. */
export const ehPendente = (d: Pick<DespesaRelatorio, "status" | "aguardandoGestor">) => !d.aguardandoGestor && (d.status === STATUS_DESPESA.precisaCorrigir || d.status === STATUS_DESPESA.recusado);

type ContagemStatus = { enviado: number; validado: number; precisaCorrigir: number; recusado: number };

function contarStatus(despesas: DespesaRelatorio[]): ContagemStatus {
  const conta = (status: number) => despesas.filter((d) => d.status === status && !d.aguardandoGestor).length;
  return { enviado: conta(STATUS_DESPESA.enviado), validado: conta(STATUS_DESPESA.validado), precisaCorrigir: conta(STATUS_DESPESA.precisaCorrigir), recusado: conta(STATUS_DESPESA.recusado) };
}

export function contarSemComprovante(despesas: DespesaRelatorio[]) {
  return despesas.filter((d) => d.statusAnexo != null && ANEXO_SEM_COMPROVANTE.includes(d.statusAnexo)).length;
}

export type PontoTendencia = { chave: string; rotulo: string; valor: number | null; noPeriodo: boolean };
const MESES_TENDENCIA = 6;

/**
 * R$/L e refeição média mês a mês nos 6 meses da janela de busca (até o mês atual), sem os meses iniciais vazios nas
 * duas séries. `noPeriodo` marca os meses do período escolhido.
 */
export function tendenciaMensal(despesas: DespesaRelatorio[], periodo: Pick<Periodo, "inicio" | "fim">, hoje: string) {
  const litro: PontoTendencia[] = [];
  const refeicao: PontoTendencia[] = [];
  for (let i = MESES_TENDENCIA - 1; i >= 0; i -= 1) {
    const inicio = inicioDoMes(hoje, -i);
    const lista = despesasDoPeriodo(despesas, inicio, inicioDoMes(hoje, 1 - i));
    const base = { chave: inicio, rotulo: MESES_CURTOS[Number(inicio.slice(5, 7)) - 1], noPeriodo: inicio >= periodo.inicio && inicio < periodo.fim };
    litro.push({ ...base, valor: precoMedioLitro(lista)?.valor ?? null });
    refeicao.push({ ...base, valor: mediaPorGasto(lista, "almoco", "jantar")?.valor ?? null });
  }
  const primeiro = litro.findIndex((ponto, i) => ponto.valor != null || refeicao[i].valor != null);
  const corte = primeiro < 0 ? litro.length : primeiro;
  return { litro: litro.slice(corte), refeicao: refeicao.slice(corte) };
}

// ---------------- Modelo da tela ----------------

export type RelatorioModelo = {
  periodo: Periodo;
  total: number;
  quantidade: number;
  cartoes: CartaoMedia[];
  status: ContagemStatus;
  semComprovante: number;
  tendencia: ReturnType<typeof tendenciaMensal>;
  /** Despesas do período, da mais recente para a mais antiga, com as devolvidas (que pedem ação) primeiro, mesmo de outro mês. */
  despesas: DespesaRelatorio[];
};

export function montarRelatorio(despesas: DespesaRelatorio[], periodoId: PeriodoId, hoje: string): RelatorioModelo {
  const periodo = periodoDe(periodoId, hoje);
  const doPeriodo = despesasDoPeriodo(despesas, periodo.inicio, periodo.fim);
  const cartoes = montarCartoes(calcularMedias(despesas, periodo.inicio, periodo.fim), calcularMedias(despesas, periodo.anteriorInicio, periodo.anteriorFim));
  const lista = ordenarComDevolvidasNoTopo(doPeriodo, despesas);
  const status = contarStatus(lista);
  const semComprovante = contarSemComprovante(doPeriodo);
  return {
    periodo,
    total: soma(doPeriodo.map((d) => d.valor)),
    quantidade: doPeriodo.length,
    cartoes,
    status,
    semComprovante,
    tendencia: tendenciaMensal(despesas, periodo, hoje),
    despesas: lista
  };
}

/** Devolvida que pede ação do motorista: Precisa corrigir sem estar com o gestor. */
export const ehDevolvidaParaAcao = (d: Pick<DespesaRelatorio, "status" | "aguardandoGestor">) => d.status === STATUS_DESPESA.precisaCorrigir && !d.aguardandoGestor;

/** Devolvidas primeiro (de qualquer mês da janela carregada, para não ficarem escondidas), depois o resto por data desc. */
function ordenarComDevolvidasNoTopo(doPeriodo: DespesaRelatorio[], todas: DespesaRelatorio[]) {
  const ids = new Set(doPeriodo.map((d) => d.id));
  const foraDoPeriodo = todas.filter((d) => ehDevolvidaParaAcao(d) && !ids.has(d.id));
  return [...doPeriodo, ...foraDoPeriodo].sort((a, b) => Number(ehDevolvidaParaAcao(b)) - Number(ehDevolvidaParaAcao(a)) || b.data.localeCompare(a.data));
}

// ---------------- Loader e mock ----------------

const MOCK_VEICULO = "00000000-0000-4000-8000-0000000000bb";
const mockParam = (name: string) => new URLSearchParams(window.location.search).get(name);
const diasDoMes = (inicio: string) => Number(somarDias(inicioDoMes(inicio, 1), -1).slice(8, 10));

// [mês (0 = atual), posição no mês 0..1, categoria, valor, status, anexo, litros, km, estabelecimento, cartão]
type MockItem = [number, number, string, number, number, number, number?, number?, string?, boolean?];
const E = STATUS_DESPESA.enviado, V = STATUS_DESPESA.validado, P = STATUS_DESPESA.precisaCorrigir, R = STATUS_DESPESA.recusado, C = STATUS_DESPESA.cancelado;
const MOCK_ITENS: MockItem[] = [
  [0, 0.05, "Abastecimento", 312.4, V, 100000002, 52, 48650, "Posto Ipiranga Dutra"],
  [0, 0.12, "Almoço", 41.5, V, 100000002, undefined, undefined, "Restaurante Sabor Mineiro"],
  [0, 0.2, "Pedágio", 18.9, V, 100000002, undefined, undefined, "Concessionária Dutra"],
  [0, 0.3, "Estacionamento", 32, E, 100000002, undefined, undefined, "Estacionamento Aeroporto GRU"],
  [0, 0.38, "Jantar", 52.8, E, 100000002, undefined, undefined, "Cantina Bella Vista"],
  [0, 0.45, "Abastecimento", 298.1, E, 100000002, 48.5, 49200, "Posto Shell Castelo"],
  [0, 0.5, "Hospedagem", 80, C, 100000000, undefined, undefined, "Hotel Centro"],
  [0, 0.52, "Café", 14, E, 100000002, undefined, undefined, "Padaria Estrela"],
  [0, 0.6, "Lanche", 22.5, P, 100000000, undefined, undefined, "Lanchonete do Posto", true],
  [0, 0.68, "Almoço", 38.9, E, 100000002, undefined, undefined, "Restaurante Fogo de Chão"],
  [0, 0.75, "Lavagem", 45, V, 100000002, undefined, undefined, "Lava Rápido Express"],
  [0, 0.82, "Abastecimento", 276, E, 100000002, 44, 49730, "Posto Ipiranga Dutra"],
  [0, 0.9, "Pedágio", 24.4, R, 100000002, undefined, undefined, "Concessionária Rodoanel"],
  [0, 1, "Estacionamento", 28, P, 100000000, undefined, undefined, "Estacionamento Shopping Anália", true],
  [-1, 0.06, "Abastecimento", 301, V, 100000002, 51, 46980, "Posto Ipiranga Dutra"],
  [-1, 0.2, "Almoço", 36, V, 100000002, undefined, undefined, "Restaurante Sabor Mineiro"],
  [-1, 0.28, "Jantar", 44, V, 100000002, undefined, undefined, "Cantina Bella Vista"],
  [-1, 0.35, "Abastecimento", 289.5, V, 100000002, 49, 47500, "Posto Shell Castelo"],
  [-1, 0.42, "Pedágio", 17.8, V, 100000002, undefined, undefined, "Concessionária Dutra"],
  [-1, 0.5, "Café", 12.5, V, 100000002, undefined, undefined, "Padaria Estrela"],
  [-1, 0.58, "Estacionamento", 30, V, 100000002, undefined, undefined, "Estacionamento Aeroporto GRU"],
  [-1, 0.66, "Abastecimento", 295, V, 100000002, 49.6, 48050, "Posto Ipiranga Dutra"],
  [-1, 0.72, "Almoço", 35.5, V, 100000002, undefined, undefined, "Restaurante Fogo de Chão"],
  [-1, 0.8, "Hospedagem", 210, V, 100000002, undefined, undefined, "Hotel Centro"],
  [-1, 0.88, "Lavagem", 40, V, 100000002, undefined, undefined, "Lava Rápido Express"],
  [-1, 0.95, "Lanche", 19.5, V, 100000002, undefined, undefined, "Lanchonete do Posto"],
  [-2, 0.3, "Abastecimento", 285, V, 100000002, 50, 46450, "Posto Shell Castelo"],
  [-2, 0.5, "Almoço", 33, V, 100000002, undefined, undefined, "Restaurante Sabor Mineiro"],
  [-2, 0.7, "Pedágio", 16.5, V, 100000002, undefined, undefined, "Concessionária Dutra"]
];

/** ~29 despesas em 3 meses, ancoradas em `hoje` (nenhuma no futuro). Os nomes de categoria são os reais do app. */
/** Os 3 gastos do mock de gastos do cartão (mesmos ids), para o relatório local mostrar o selo "Completar". */
const MOCK_CARTAO: [string, string, number, string, string][] = [
  ["a1111111-1111-4111-8111-111111111111", "Abastecimento", 245.9, "2026-11-02", "Posto Ipiranga Dutra"],
  ["a2222222-2222-4222-8222-222222222222", "Estacionamento", 58, "2026-11-03", "Estacionamento Aeroporto GRU"],
  ["a3333333-3333-4333-8333-333333333333", "Outros", 132.4, "2026-11-03", "Restaurante Fogo de Chão"]
];

/** Devolução nos itens do mock, por posição em `MOCK_ITENS`: devolvida, com o gestor e em nova conferência. */
const MOCK_DEVOLUCAO: Partial<Record<number, Pick<DespesaRelatorio, "motivoDevolucao" | "justificativa" | "aguardandoGestor">>> = {
  5: { motivoDevolucao: "O valor do cupom não bate com o valor lançado.", justificativa: "O posto emitiu o cupom com o valor errado e corrigiu à mão.", aguardandoGestor: false },
  8: { motivoDevolucao: "O comprovante está cortado e não dá para ler o total. Troque a foto ou explique o que aconteceu.", justificativa: "", aguardandoGestor: false },
  13: { motivoDevolucao: "A data do cupom é diferente da data do gasto.", justificativa: "O cupom foi emitido na saída do estacionamento, no dia seguinte.", aguardandoGestor: true }
};

const devolucaoMock = (indice: number) => ({ motivoDevolucao: "", justificativa: "", aguardandoGestor: false, ...MOCK_DEVOLUCAO[indice] });

export function despesasMock(hoje: string): DespesaRelatorio[] {
  const nomes = new Map(DEFAULT_EXPENSE_REFERENCE_DATA.categories.map((c) => [norm(c.name), c.name]));
  const doCartao: DespesaRelatorio[] = MOCK_CARTAO.filter(([, , , data]) => data <= hoje).map(([id, categoria, valor, data, estabelecimento]) => ({
    id, valor, data, categoria: nomes.get(norm(categoria)) ?? categoria, formaPagamentoId: "local-cartao-credito", status: STATUS_DESPESA.precisaCorrigir,
    statusAnexo: 100000000, litros: null, km: null, veiculoId: "", estabelecimento, conciliadaCartao: true,
    motivoDevolucao: "", iaMotivos: "", justificativa: "", aguardandoGestor: false
  }));
  return [...doCartao, ...MOCK_ITENS.map(([mes, posicao, categoria, valor, status, anexo, litros, km, estabelecimento, cartao], i) => {
    const inicio = inicioDoMes(hoje, mes);
    const ultimoDia = mes === 0 ? Number(hoje.slice(8, 10)) : diasDoMes(inicio);
    const dia = Math.max(1, Math.ceil(posicao * ultimoDia));
    return {
      id: `mock-despesa-${i + 1}`, valor, data: `${inicio.slice(0, 8)}${pad(dia)}`, categoria: nomes.get(norm(categoria)) ?? categoria,
      formaPagamentoId: cartao ? "local-cartao-credito" : "local-particular-reembolso", status, statusAnexo: anexo,
      litros: litros ?? null, km: km ?? null, veiculoId: litros ? MOCK_VEICULO : "", estabelecimento: estabelecimento ?? "", conciliadaCartao: Boolean(cartao),
      iaMotivos: "", ...devolucaoMock(i)
    };
  })];
}

const mockDelay = () => new Promise((resolve) => setTimeout(resolve, 300));

/** Despesas do motorista dos últimos 6 meses (cobre qualquer período e o anterior); o recorte e as contas são locais. */
export async function carregarDespesasRelatorio(motoristaId: string, hoje = hojeSaoPaulo()): Promise<DespesaRelatorio[]> {
  if (isMockGastosCartao()) {
    await mockDelay();
    const modo = mockParam("mockGastosRelatorio");
    if (modo === "erro") throw new Error("Falha simulada ao carregar o relatório de gastos.");
    if (modo === "vazio") return [];
    return despesasMock(hoje);
  }
  const filtro = filtroDespesasRelatorio(motoristaId, hoje);
  const consultar = (comDevolucao: boolean) => retrieveMultipleAll(DATAVERSE.despesasOperacionais, `${selectDespesas(comDevolucao)}&$filter=${filtro}&$orderby=cr40f_datagasto desc`);
  // Ambiente sem as colunas da devolução (ainda não publicadas): o relatório segue sem elas em vez de quebrar.
  const [referencia, resultado] = await Promise.all([
    loadExpenseReferenceDataRemote(),
    consultar(true).catch(() => consultar(false))
  ]);
  const nomes = new Map(referencia.categories.map((c) => [cleanGuid(c.id).toLowerCase(), c.name]));
  return resultado.entities.map((row) => mapDespesaRelatorio(row, nomes));
}
