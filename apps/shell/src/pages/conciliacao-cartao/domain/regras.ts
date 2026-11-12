import type { StatusTone } from '@betinhos/ui'
import { OPERACIONAL } from '../../despesas/domain/status'
import { addDays } from '../../operacional/domain/time'
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

export type Filtros = { cartaoId: string | null; motoristaId: string | null; de: string; ate: string }
export const FILTROS_VAZIOS: Filtros = { cartaoId: null, motoristaId: null, de: '', ate: '' }

/** Filtros por cartão, motorista e período (data da compra, `aaaa-mm-dd`, limites inclusivos). */
export function filtrar(list: Transacao[], f: Filtros) {
  return list.filter((t) =>
    (!f.cartaoId || t.cartaoId === f.cartaoId) &&
    (!f.motoristaId || t.motoristaId === f.motoristaId) &&
    (!f.de || t.dataCompra >= f.de) &&
    (!f.ate || t.dataCompra <= f.ate))
}

const collator = new Intl.Collator('pt-BR')
export const porData = (a: Transacao, b: Transacao) => b.dataCompra.localeCompare(a.dataCompra) || collator.compare(a.descricao, b.descricao)

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
