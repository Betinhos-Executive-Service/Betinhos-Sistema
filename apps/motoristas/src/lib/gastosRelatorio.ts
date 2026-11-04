import { cleanGuid, GUID_PATTERN } from "./comunicados.ts";
import { DATAVERSE, loadExpenseReferenceDataRemote, retrieveMultipleAll } from "./dataverse.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA } from "./expenses.defaults.ts";
import { formatDiaMes, isMockGastosCartao } from "./gastosCartao.ts";

// Relatório de gastos do motorista: números, médias e insights calculados no app (sem IA).
// Colunas de cr40f_despesaoperacional conferidas em expenses.payload.ts, dataverse.ts e gastosCartao.ts.

export const STATUS_DESPESA = { enviado: 100000000, precisaCorrigir: 100000001, validado: 100000002, recusado: 100000003, cancelado: 100000004 } as const;
/** cr40f_statusanexo: 100000000 Sem anexo, 100000003 Falhou (sem comprovante utilizável). */
const ANEXO_SEM_COMPROVANTE = [100000000, 100000003];
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
};

type Periodo = {
  id: PeriodoId;
  rotulo: string;
  /** Datas `AAAA-MM-DD`; `fim` é exclusivo. */
  inicio: string;
  fim: string;
  anteriorInicio: string;
  anteriorFim: string;
  /** Texto de "vs ..." usado nas variações e insights. */
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

const diaDaSemana = (data: string) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
};
const somarDias = (data: string, dias: number) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const segundaDaSemana = (data: string) => somarDias(data, -((diaDaSemana(data) + 6) % 7));
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ---------------- Formatação ----------------

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DECIMAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatBRL = (valor: number) => BRL.format(valor);

// ---------------- Mapeamento ----------------

type Row = Record<string, unknown>;
const numberOrNull = (value: unknown) => (value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
const lookup = (value: unknown) => (value == null ? "" : cleanGuid(String(value)).toLowerCase());

const DESPESA_SELECT = "$select=cr40f_despesaoperacionalid,cr40f_valor,cr40f_datagasto,_cr40f_categoria_value,_cr40f_formapagamento_value,_cr40f_veiculo_value,cr40f_statusoperacional,cr40f_statusanexo,cr40f_litros,cr40f_kminformado,cr40f_estabelecimento,cr40f_conciliadacartao";

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
    conciliadaCartao: row.cr40f_conciliadacartao === true
  };
}

export function filtroDespesasRelatorio(motoristaId: string, hoje: string) {
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para carregar o relatório de gastos.");
  const { inicio, fim } = janelaDeBusca(hoje);
  return `_cr40f_motorista_value eq ${id} and statecode eq 0 and cr40f_datagasto ge ${inicio}T00:00:00Z and cr40f_datagasto lt ${fim}T00:00:00Z`;
}

// ---------------- Agregações puras ----------------

const norm = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ehCategoria = (despesa: DespesaRelatorio, ...nomes: string[]) => nomes.includes(norm(despesa.categoria));
const soma = (lista: number[]) => lista.reduce((total, valor) => total + valor, 0);

/** Despesas válidas do intervalo `[inicio, fim)`: Cancelado fica de fora de todas as contas. */
export function despesasDoPeriodo(despesas: DespesaRelatorio[], inicio: string, fim: string) {
  return despesas.filter((d) => d.status !== STATUS_DESPESA.cancelado && d.data >= inicio && d.data < fim);
}

function totalPorCategoria(despesas: DespesaRelatorio[]) {
  const mapa = new Map<string, { categoria: string; total: number; quantidade: number }>();
  for (const d of despesas) {
    const atual = mapa.get(d.categoria) ?? { categoria: d.categoria, total: 0, quantidade: 0 };
    atual.total += d.valor;
    atual.quantidade += 1;
    mapa.set(d.categoria, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, "pt-BR"));
}

/** Soma do valor dos abastecimentos ÷ soma dos litros; ignora abastecimento sem litros. */
export function precoMedioLitro(despesas: DespesaRelatorio[]) {
  const abastecimentos = despesas.filter((d) => ehCategoria(d, "abastecimento") && (d.litros ?? 0) > 0);
  const litros = soma(abastecimentos.map((d) => d.litros ?? 0));
  return litros > 0 ? { valor: soma(abastecimentos.map((d) => d.valor)) / litros, quantidade: abastecimentos.length } : null;
}

const CONSUMO_MIN_KM_L = 3;
const CONSUMO_MAX_KM_L = 30;
const CONSUMO_MIN_TRECHOS = 2;

/**
 * Consumo médio em km/L (estimativa, tanque cheio): para cada veículo, abastecimentos em ordem de data; cada trecho
 * é (KM do abastecimento − KM do anterior) ÷ litros do abastecimento. Só entra trecho cujo abastecimento final cai em
 * `[inicio, fim)`, com KM crescente e consumo plausível (3 a 30 km/L). Com menos de 2 trechos válidos, devolve null.
 */
export function consumoMedioKmL(despesas: DespesaRelatorio[], inicio: string, fim: string) {
  const porVeiculo = new Map<string, DespesaRelatorio[]>();
  for (const d of despesas) {
    if (d.status === STATUS_DESPESA.cancelado || !ehCategoria(d, "abastecimento") || !d.veiculoId || (d.litros ?? 0) <= 0 || (d.km ?? 0) <= 0) continue;
    porVeiculo.set(d.veiculoId, [...(porVeiculo.get(d.veiculoId) ?? []), d]);
  }
  let distancia = 0;
  let litros = 0;
  let trechos = 0;
  for (const lista of porVeiculo.values()) {
    lista.sort((a, b) => a.data.localeCompare(b.data) || (a.km ?? 0) - (b.km ?? 0));
    for (let i = 1; i < lista.length; i += 1) {
      const atual = lista[i];
      const delta = (atual.km ?? 0) - (lista[i - 1].km ?? 0);
      if (atual.data < inicio || atual.data >= fim || delta <= 0) continue;
      const kmPorLitro = delta / (atual.litros ?? 1);
      if (kmPorLitro < CONSUMO_MIN_KM_L || kmPorLitro > CONSUMO_MAX_KM_L) continue;
      distancia += delta;
      litros += atual.litros ?? 0;
      trechos += 1;
    }
  }
  return trechos >= CONSUMO_MIN_TRECHOS ? { valor: distancia / litros, quantidade: trechos } : null;
}

/** Valor médio por gasto nas categorias informadas. */
export function mediaPorGasto(despesas: DespesaRelatorio[], ...categorias: string[]) {
  const lista = despesas.filter((d) => ehCategoria(d, ...categorias));
  return lista.length ? { valor: soma(lista.map((d) => d.valor)) / lista.length, quantidade: lista.length } : null;
}

type Media = { valor: number; quantidade: number } | null;
type MediasBrutas = {
  litro: Media; consumo: Media; refeicao: Media; cafeLanche: Media; estacionamento: Media; pedagio: Media; lavagem: Media;
};

export function calcularMedias(todas: DespesaRelatorio[], inicio: string, fim: string): MediasBrutas {
  const lista = despesasDoPeriodo(todas, inicio, fim);
  return {
    litro: precoMedioLitro(lista),
    consumo: consumoMedioKmL(todas, inicio, fim),
    refeicao: mediaPorGasto(lista, "almoco", "jantar"),
    cafeLanche: mediaPorGasto(lista, "cafe", "lanche"),
    estacionamento: mediaPorGasto(lista, "estacionamento"),
    pedagio: mediaPorGasto(lista, "pedagio"),
    lavagem: mediaPorGasto(lista, "lavagem")
  };
}

/** Variação percentual inteira; null sem base (período anterior vazio ou zero). */
export function variacaoPercentual(atual: number | null | undefined, anterior: number | null | undefined) {
  if (atual == null || anterior == null || !(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function textoVariacao(variacao: number | null, rotuloAnterior: string) {
  if (variacao == null) return null;
  if (variacao === 0) return `igual ao ${rotuloAnterior}`;
  return `${variacao > 0 ? "+" : "−"}${Math.abs(variacao)}% vs ${rotuloAnterior}`;
}

type CartaoMedia = {
  id: "litro" | "consumo" | "refeicao" | "cafeLanche" | "estacionamento" | "pedagio" | "lavagem";
  titulo: string;
  valor: number;
  valorTexto: string;
  detalhe: string;
  variacao: number | null;
  variacaoTexto: string | null;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function montarCartoes(atual: MediasBrutas, anterior: MediasBrutas, rotuloAnterior: string): CartaoMedia[] {
  const defs: { id: CartaoMedia["id"]; titulo: string; texto: (v: number) => string; detalhe: (n: number) => string }[] = [
    { id: "litro", titulo: "Preço médio por litro", texto: (v) => `${formatBRL(v)}/L`, detalhe: (n) => plural(n, "abastecimento", "abastecimentos") },
    { id: "consumo", titulo: "Consumo médio", texto: (v) => `${DECIMAL.format(v)} km/L`, detalhe: (n) => `estimado em ${plural(n, "trecho", "trechos")}` },
    { id: "refeicao", titulo: "Refeição média", texto: formatBRL, detalhe: (n) => `almoço e jantar · ${plural(n, "gasto", "gastos")}` },
    { id: "cafeLanche", titulo: "Café e lanche médio", texto: formatBRL, detalhe: (n) => plural(n, "gasto", "gastos") },
    { id: "estacionamento", titulo: "Estacionamento médio", texto: formatBRL, detalhe: (n) => plural(n, "gasto", "gastos") },
    { id: "pedagio", titulo: "Pedágio médio", texto: formatBRL, detalhe: (n) => plural(n, "gasto", "gastos") },
    { id: "lavagem", titulo: "Lavagem média", texto: formatBRL, detalhe: (n) => plural(n, "gasto", "gastos") }
  ];
  return defs.flatMap((def) => {
    const media = atual[def.id];
    if (!media) return [];
    const variacao = variacaoPercentual(media.valor, anterior[def.id]?.valor);
    return [{ id: def.id, titulo: def.titulo, valor: media.valor, valorTexto: def.texto(media.valor), detalhe: def.detalhe(media.quantidade), variacao, variacaoTexto: textoVariacao(variacao, rotuloAnterior) }];
  });
}

type ContagemStatus = { enviado: number; validado: number; precisaCorrigir: number; recusado: number };

function contarStatus(despesas: DespesaRelatorio[]): ContagemStatus {
  const conta = (status: number) => despesas.filter((d) => d.status === status).length;
  return { enviado: conta(STATUS_DESPESA.enviado), validado: conta(STATUS_DESPESA.validado), precisaCorrigir: conta(STATUS_DESPESA.precisaCorrigir), recusado: conta(STATUS_DESPESA.recusado) };
}

export function contarSemComprovante(despesas: DespesaRelatorio[]) {
  return despesas.filter((d) => d.statusAnexo != null && ANEXO_SEM_COMPROVANTE.includes(d.statusAnexo)).length;
}

export type BarraEvolucao = { chave: string; rotulo: string; total: number; quantidade: number };

/** Colunas da evolução: semanas (segunda a domingo) em um mês, meses em "3 meses". Não cria colunas vazias depois de `hoje` (só até a última despesa, se for futura). */
export function agruparEvolucao(despesas: DespesaRelatorio[], periodo: Pick<Periodo, "id" | "inicio" | "fim">, hoje: string): { tipo: "semana" | "mes"; barras: BarraEvolucao[] } {
  const porMes = periodo.id === "3meses";
  const chaveDe = (data: string) => (porMes ? `${data.slice(0, 7)}-01` : segundaDaSemana(data));
  const barras = new Map<string, BarraEvolucao>();
  const ultimo = despesas.reduce((maior, d) => (d.data > maior ? d.data : maior), hoje);
  const limite = ultimo < periodo.fim ? somarDias(ultimo, 1) : periodo.fim;
  let cursor = periodo.inicio;
  while (cursor < limite) {
    const chave = chaveDe(cursor);
    if (!barras.has(chave)) {
      const rotulo = porMes ? MESES_CURTOS[Number(cursor.slice(5, 7)) - 1] : formatDiaMes(cursor);
      barras.set(chave, { chave, rotulo, total: 0, quantidade: 0 });
    }
    cursor = porMes ? inicioDoMes(cursor, 1) : somarDias(segundaDaSemana(cursor), 7);
  }
  for (const d of despesas) {
    const barra = barras.get(chaveDe(d.data));
    if (!barra || d.data < periodo.inicio || d.data >= periodo.fim) continue;
    barra.total += d.valor;
    barra.quantidade += 1;
  }
  return { tipo: porMes ? "mes" : "semana", barras: [...barras.values()] };
}

// ---------------- Insights ----------------

/** 2 a 4 frases curtas e acionáveis, sem percentual do total do mês. */
function gerarInsights({ cartoes, status, semComprovante, rotuloAnterior }: { cartoes: CartaoMedia[]; status: ContagemStatus; semComprovante: number; rotuloAnterior: string }) {
  const insights: string[] = [];
  if (status.precisaCorrigir > 0) insights.push(`${plural(status.precisaCorrigir, "gasto precisa", "gastos precisam")} de correção.`);
  if (semComprovante > 0) insights.push(`${plural(semComprovante, "gasto está", "gastos estão")} sem comprovante.`);
  const litro = cartoes.find((c) => c.id === "litro");
  if (litro?.variacao != null && litro.variacao !== 0) insights.push(`Preço do litro ${litro.variacao > 0 ? "subiu" : "caiu"} ${Math.abs(litro.variacao)}% vs ${rotuloAnterior}.`);
  const consumo = cartoes.find((c) => c.id === "consumo");
  if (consumo?.variacao != null && Math.abs(consumo.variacao) >= 3) insights.push(`Seu consumo ${consumo.variacao > 0 ? "melhorou" : "piorou"} ${Math.abs(consumo.variacao)}% vs ${rotuloAnterior}.`);
  const refeicao = cartoes.find((c) => c.id === "refeicao");
  if (refeicao) insights.push(`Sua refeição média é ${refeicao.valorTexto}.`);
  if (litro && (litro.variacao == null || litro.variacao === 0)) insights.push(`O litro saiu em média ${litro.valorTexto.replace("/L", "")}.`);
  return insights.slice(0, 4);
}

// ---------------- Modelo da tela ----------------

export type RelatorioModelo = {
  periodo: Periodo;
  total: number;
  quantidade: number;
  categorias: ReturnType<typeof totalPorCategoria>;
  cartoes: CartaoMedia[];
  insights: string[];
  status: ContagemStatus;
  semComprovante: number;
  evolucao: ReturnType<typeof agruparEvolucao>;
  ultimas: DespesaRelatorio[];
};

export function montarRelatorio(despesas: DespesaRelatorio[], periodoId: PeriodoId, hoje: string): RelatorioModelo {
  const periodo = periodoDe(periodoId, hoje);
  const doPeriodo = despesasDoPeriodo(despesas, periodo.inicio, periodo.fim);
  const cartoes = montarCartoes(calcularMedias(despesas, periodo.inicio, periodo.fim), calcularMedias(despesas, periodo.anteriorInicio, periodo.anteriorFim), periodo.rotuloAnterior);
  const status = contarStatus(doPeriodo);
  const semComprovante = contarSemComprovante(doPeriodo);
  return {
    periodo,
    total: soma(doPeriodo.map((d) => d.valor)),
    quantidade: doPeriodo.length,
    categorias: totalPorCategoria(doPeriodo),
    cartoes,
    insights: gerarInsights({ cartoes, status, semComprovante, rotuloAnterior: periodo.rotuloAnterior }),
    status,
    semComprovante,
    evolucao: agruparEvolucao(doPeriodo, periodo, hoje),
    ultimas: [...doPeriodo].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10)
  };
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
export function despesasMock(hoje: string): DespesaRelatorio[] {
  const nomes = new Map(DEFAULT_EXPENSE_REFERENCE_DATA.categories.map((c) => [norm(c.name), c.name]));
  return MOCK_ITENS.map(([mes, posicao, categoria, valor, status, anexo, litros, km, estabelecimento, cartao], i) => {
    const inicio = inicioDoMes(hoje, mes);
    const ultimoDia = mes === 0 ? Number(hoje.slice(8, 10)) : diasDoMes(inicio);
    const dia = Math.max(1, Math.ceil(posicao * ultimoDia));
    return {
      id: `mock-despesa-${i + 1}`, valor, data: `${inicio.slice(0, 8)}${pad(dia)}`, categoria: nomes.get(norm(categoria)) ?? categoria,
      formaPagamentoId: cartao ? "local-cartao-credito" : "local-particular-reembolso", status, statusAnexo: anexo,
      litros: litros ?? null, km: km ?? null, veiculoId: litros ? MOCK_VEICULO : "", estabelecimento: estabelecimento ?? "", conciliadaCartao: Boolean(cartao)
    };
  });
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
  const [referencia, resultado] = await Promise.all([
    loadExpenseReferenceDataRemote(),
    retrieveMultipleAll(DATAVERSE.despesasOperacionais, `${DESPESA_SELECT}&$filter=${filtro}&$orderby=cr40f_datagasto desc`)
  ]);
  const nomes = new Map(referencia.categories.map((c) => [cleanGuid(c.id).toLowerCase(), c.name]));
  return resultado.entities.map((row) => mapDespesaRelatorio(row, nomes));
}
