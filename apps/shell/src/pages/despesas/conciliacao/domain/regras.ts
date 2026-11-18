import type { StatusTone } from '@betinhos/ui'
import { OPERACIONAL } from '../../domain/status'
import { addDays, dateKey } from '../../../operacional/domain/time'
import type { Cartao, DespesaCandidata, Transacao } from './types'

/** Choices criados por provision-conciliacao-cartao.ps1 (mesmos códigos do flow diário). */
export const TIPO = { compra: 100000000, estorno: 100000001, pagamento: 100000002, encargo: 100000003 } as const
export const SITUACAO = {
  pendente: 100000000, automatica: 100000001, manual: 100000002, aguardando: 100000003,
  semMotorista: 100000004, divergencia: 100000005, ignorada: 100000006,
} as const

/** `cr40f_canal` (migration 20261112-1335): de onde veio a transação. */
export const CANAL = { pluggy: 100000000, ctf: 100000001, ticketlog: 100000002 } as const
const CANAL_LABEL: Record<number, string> = { [CANAL.pluggy]: 'Cartão Itaú', [CANAL.ctf]: 'CTF', [CANAL.ticketlog]: 'TicketLog' }
/** Vazio = Pluggy: as linhas de antes da coluna são todas do Itaú. */
export const canalLabel = (c: number | null) => CANAL_LABEL[c ?? CANAL.pluggy] ?? 'Outro'
export const ehPluggy = (t: Transacao) => t.canal == null || t.canal === CANAL.pluggy

/** Abas da tela. "Aguardando motorista" tem aba própria: a despesa já existe e quem age é o motorista. */
export type Aba = 'revisar' | 'aguardando' | 'conciliadas' | 'ignoradas'

const SITUACAO_LABEL: Record<number, [string, StatusTone, Aba]> = {
  [SITUACAO.pendente]: ['Pendente', 'warning', 'revisar'],
  [SITUACAO.automatica]: ['Conciliada automática', 'success', 'conciliadas'],
  [SITUACAO.manual]: ['Conciliada manual', 'success', 'conciliadas'],
  [SITUACAO.aguardando]: ['Aguardando motorista', 'info', 'aguardando'],
  [SITUACAO.semMotorista]: ['Sem motorista', 'danger', 'revisar'],
  [SITUACAO.divergencia]: ['Divergência', 'danger', 'revisar'],
  [SITUACAO.ignorada]: ['Ignorada', 'neutral', 'ignoradas'],
}
export const situacaoLabel = (s: number | null) => (s == null ? 'Sem situação' : SITUACAO_LABEL[s]?.[0] ?? 'Outra')
export const situacaoTone = (s: number | null): StatusTone => (s == null ? 'neutral' : SITUACAO_LABEL[s]?.[1] ?? 'neutral')

const TIPO_LABEL: Record<number, string> = { [TIPO.compra]: 'Compra', [TIPO.estorno]: 'Estorno', [TIPO.pagamento]: 'Pagamento de fatura', [TIPO.encargo]: 'Encargo' }
export const tipoLabel = (t: number | null) => (t == null ? '—' : TIPO_LABEL[t] ?? 'Outro')

/** Situação vazia ou desconhecida cai em "Para revisar" para não sumir da tela. */
export const abaDe = (s: number | null): Aba => (s == null ? undefined : SITUACAO_LABEL[s]?.[2]) ?? 'revisar'

/** Motivos gravados pela tela (a lista local mostra o mesmo texto sem recarregar). */
export const MOTIVO_CASADA = 'Casada manualmente no Sistema Betinhos.'
export const MOTIVO_REABERTA = 'Reaberta no Sistema Betinhos.'
export const motivoReprocessar = (c: Cartao) => `Cartão ${c.nome} vinculado no Sistema Betinhos; a conciliação casa na hora com a despesa do motorista ou cria uma para ele validar.`

/** Filtros da fila. `busca` confere estabelecimento, descrição, motorista, cartão, placa e motivo; `canal` vazio no registro = Itaú. */
export type Filtros = { busca: string; cartaoId: string | null; motoristaId: string | null; canal: number | null; situacao: number | null; de: string; ate: string }
export const FILTROS_VAZIOS: Filtros = { busca: '', cartaoId: null, motoristaId: null, canal: null, situacao: null, de: '', ate: '' }

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const textoDe = (t: Transacao) => normalizar([t.estabelecimento, t.descricao, t.motoristaNome, t.cartaoNome, t.final, t.placa, t.motivo, t.despesaNome].join(' '))

/** Filtros por texto, cartão, motorista, canal, situação e período (data da compra, `aaaa-mm-dd`, limites inclusivos). */
export function filtrar(list: Transacao[], f: Filtros) {
  const palavras = normalizar(f.busca).split(/\s+/).filter(Boolean)
  return list.filter((t) =>
    (!f.cartaoId || t.cartaoId === f.cartaoId) &&
    (!f.motoristaId || t.motoristaId === f.motoristaId) &&
    (f.canal == null || (t.canal ?? CANAL.pluggy) === f.canal) &&
    (f.situacao == null || t.situacao === f.situacao) &&
    (!f.de || t.dataCompra >= f.de) &&
    (!f.ate || t.dataCompra <= f.ate) &&
    (!palavras.length || palavras.every((p) => textoDe(t).includes(p))))
}

/** Situações da fila "Para revisar", na ordem dos cartões de resumo. */
export const SITUACOES_REVISAR = [SITUACAO.pendente, SITUACAO.semMotorista, SITUACAO.divergencia] as const
export const CANAIS = [CANAL.pluggy, CANAL.ctf, CANAL.ticketlog] as const

/** Quantidade e valor por situação (só as da fila Para revisar). */
export function resumoRevisar(list: Transacao[]) {
  const r = new Map<number, { qtd: number; total: number }>(SITUACOES_REVISAR.map((s) => [s, { qtd: 0, total: 0 }]))
  for (const t of list) {
    const item = t.situacao == null ? undefined : r.get(t.situacao)
    if (item) { item.qtd += 1; item.total += t.valor }
  }
  return r
}

/** Dias corridos entre a compra e `hoje` (`aaaa-mm-dd`); nunca negativo. */
export const diasDesde = (dataCompra: string, hoje: string) =>
  Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dataCompra}T12:00:00Z`)) / 86_400_000))
export const idadeTexto = (dias: number) => (dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`)
/** A partir daqui a compra parada na fila ganha destaque (mesmo prazo da escalada ao gestor). */
export const DIAS_ATRASO = 3

export type Ordem = 'recentes' | 'antigas' | 'valor'
export const ORDENS: { value: Ordem; label: string }[] = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'antigas', label: 'Mais antigas' },
  { value: 'valor', label: 'Maior valor' },
]

/** Motivos prontos para ignorar (o texto continua editável). */
export const MOTIVOS_RAPIDOS = [
  'Compra pessoal já descontada do motorista.',
  'Tarifa ou encargo do banco.',
  'Lançamento duplicado no banco.',
  'Compra da empresa, sem motorista responsável.',
]

const collator = new Intl.Collator('pt-BR')
export const porData = (a: Transacao, b: Transacao) => b.dataCompra.localeCompare(a.dataCompra) || collator.compare(a.descricao, b.descricao)
export function ordenar(list: Transacao[], ordem: Ordem) {
  if (ordem === 'recentes') return list
  const copia = [...list]
  return ordem === 'antigas'
    ? copia.sort((a, b) => a.dataCompra.localeCompare(b.dataCompra) || collator.compare(a.descricao, b.descricao))
    : copia.sort((a, b) => b.valor - a.valor || porData(a, b))
}

/** Diferença entre a despesa candidata e a compra: centavos (despesa − compra inteira) e dias (gasto − compra, em São Paulo). */
export function diferencaCandidata(d: Pick<DespesaCandidata, 'valor' | 'data'>, t: Pick<Transacao, 'valor' | 'totalParcelas' | 'dataCompra'>) {
  const { alvo } = janelaCandidatas(t)
  const valor = d.valor == null ? null : Math.round((d.valor - alvo) * 100) / 100
  const dia = d.data ? dateKey(d.data) : null
  return { valor, dias: dia == null ? null : Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${t.dataCompra}T12:00:00Z`)) / 86_400_000) }
}

/** Linhas do CSV da fila, na ordem da lista que está na tela. */
export const CSV_CABECALHO = ['Compra', 'Estabelecimento', 'Descrição no banco', 'Canal', 'Cartão', 'Final', 'Motorista', 'Valor', 'Parcela', 'Tipo', 'Situação', 'Motivo', 'Despesa', 'Placa', 'Litros']
export function csvLinhas(list: Transacao[]): (string | number | null)[][] {
  return list.map((t) => [
    t.dataCompra.split('-').reverse().join('/'), t.estabelecimento, t.descricao, canalLabel(t.canal), t.cartaoNome, t.final, t.motoristaNome, t.valor,
    t.totalParcelas && t.totalParcelas > 1 ? `${t.parcela ?? '?'}/${t.totalParcelas}` : '', tipoLabel(t.tipo), situacaoLabel(t.situacao), t.motivo, t.despesaNome, t.placa, t.litros,
  ])
}

/** O que a tela oferece para a transação. */
export function acoes(t: Transacao) {
  const aba = abaDe(t.situacao)
  const revisar = aba === 'revisar'
  return {
    /** Sem motorista: procurar de novo o cartão vigente (depois do cadastro). Só compra do Itaú, como no flow. */
    reprocessar: revisar && !t.motoristaId && t.tipo === TIPO.compra && ehPluggy(t),
    casar: revisar && !!t.motoristaId && !t.despesaId,
    ignorar: revisar,
    reabrir: aba === 'ignoradas',
  }
}

type Vigente = { cartao: Cartao } | { erro: 'nenhum' | 'varios' }

/** Início ≤ dia e fim vazio ou ≥ dia (`aaaa-mm-dd`). */
export const vigenteEm = (c: Pick<Cartao, 'inicio' | 'fim'>, dia: string) => c.inicio != null && c.inicio <= dia && (!c.fim || c.fim >= dia)

/**
 * Cartão vigente na data da compra, com a mesma regra do flow (ação `Cartao`/`Um_cartao`): mesma conta, com motorista,
 * início ≤ compra e fim vazio ou ≥ compra. Transação com final aceita o cartão desse final ou o da conta inteira (final
 * vazio), com preferência pelo do final; sem final, só o da conta inteira. Dois candidatos do mesmo nível = "varios".
 */
export function cartaoVigente(cartoes: Cartao[], t: Pick<Transacao, 'conta' | 'final' | 'dataCompra'>): Vigente {
  const doDia = cartoes.filter((c) =>
    c.motoristaId && c.conta === t.conta && (t.final ? c.final === t.final || !c.final : !c.final) && vigenteEm(c, t.dataCompra))
  const especificos = doDia.filter((c) => c.final)
  const nivel = especificos.length ? especificos : doDia
  if (nivel.length === 1) return { cartao: nivel[0] }
  return { erro: nivel.length ? 'varios' : 'nenhum' }
}

/**
 * Janela das despesas candidatas, igual à ação `Candidatas` do flow: valor da compra inteira (parcela × total) ±0,05
 * e data do gasto do dia anterior até 2 dias depois da compra, em dias de São Paulo (03:00Z).
 */
export function janelaCandidatas(t: Pick<Transacao, 'valor' | 'totalParcelas' | 'dataCompra'>) {
  const centavos = (v: number) => Math.round(v * 100) / 100
  const alvo = centavos(t.valor * Math.max(1, t.totalParcelas ?? 1))
  const diaDe = addDays(t.dataCompra, -1)
  const diaAte = addDays(t.dataCompra, 2)
  return { alvo, valorMin: centavos(alvo - 0.05), valorMax: centavos(alvo + 0.05), diaDe, diaAte, de: `${diaDe}T03:00:00Z`, ate: `${addDays(diaAte, 1)}T03:00:00Z` }
}

/** Despesa como o mock e os testes a guardam; no Dataverse o mesmo critério vai no $filter (`candidatasPath`). */
export type DespesaMotorista = DespesaCandidata & { motoristaId: string; cartao: boolean; statusOperacional: number | null; conciliada: boolean }
/** Despesa recusada ou cancelada não casa. */
export const STATUS_FORA: number[] = [OPERACIONAL.recusado, OPERACIONAL.cancelado]

export function ehCandidata(d: DespesaMotorista, t: Transacao) {
  const j = janelaCandidatas(t)
  const ms = d.data?.getTime()
  return !d.conciliada && d.cartao && d.motoristaId === t.motoristaId && !STATUS_FORA.includes(d.statusOperacional ?? -1) &&
    d.valor != null && d.valor >= j.valorMin && d.valor <= j.valorMax &&
    ms != null && ms >= Date.parse(j.de) && ms < Date.parse(j.ate)
}

/** Formulário do cartão. */
export type CartaoForm = { nome: string; conta: string; final: string; motoristaId: string | null; inicio: string; fim: string }
export type CartaoErros = Partial<Record<keyof CartaoForm, string>>

export const cartaoParaForm = (c: Cartao | null): CartaoForm =>
  c ? { nome: c.nome, conta: c.conta, final: c.final, motoristaId: c.motoristaId || null, inicio: c.inicio ?? '', fim: c.fim ?? '' }
    : { nome: '', conta: '', final: '', motoristaId: null, inicio: '', fim: '' }

/** Campos obrigatórios, final com 4 dígitos, fim depois do início e sem sobrepor outro cartão da mesma conta e final. */
export function validarCartao(f: CartaoForm, cartoes: Cartao[], idAtual: string | null): CartaoErros {
  const e: CartaoErros = {}
  if (!f.nome.trim()) e.nome = 'Informe o nome do cartão.'
  if (!f.conta.trim()) e.conta = 'Informe a conta do Banco MCP.'
  if (f.final && !/^\d{4}$/.test(f.final)) e.final = 'Use os 4 últimos dígitos ou deixe vazio para a conta toda.'
  if (!f.motoristaId) e.motoristaId = 'Escolha o motorista.'
  if (!f.inicio) e.inicio = 'Informe o início da vigência.'
  if (f.inicio && f.fim && f.fim < f.inicio) e.fim = 'O fim da vigência não pode ser antes do início.'
  if (!e.conta && !e.final && !e.inicio && !e.fim) {
    const outro = cartoes.find((c) => c.id !== idAtual && c.conta === f.conta.trim() && c.final === f.final &&
      (c.inicio ?? '') <= (f.fim || '9999-12-31') && (f.inicio <= (c.fim || '9999-12-31')))
    if (outro) e.inicio = `A vigência sobrepõe a do cartão ${outro.nome}; o flow não saberia qual motorista usar.`
  }
  return e
}
