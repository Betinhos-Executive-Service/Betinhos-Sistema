import type { StatusTone } from '@betinhos/ui'
import type { Fechamento, Linha, Motivo, Situacao, StatusValidacao } from './types'

/** `cr40f_status` de `cr40f_validacaoservico`; espelha `packages/deploy/provision-portal-cliente.ps1`. */
export const STATUS_VALOR: Record<StatusValidacao, number> = {
  liberado: 100000000, em_duvida: 100000001, respondido: 100000002, aprovado: 100000003, aprovado_tacito: 100000004, retirado: 100000005,
}
/** `cr40f_incluirfechamento`: Pendente, Sim, Não (mesmo script). */
export const FECHAMENTO_VALOR: Record<Fechamento, number> = { pendente: 100000000, sim: 100000001, nao: 100000002 }
/** `cr40f_lado` de `cr40f_mensagemvalidacao`. */
export const LADO_VALOR = { cliente: 100000000, betinhos: 100000001 } as const
/** `cr40f_motivo` de `cr40f_mensagemvalidacao` (só na primeira mensagem da dúvida). */
export const MOTIVO_VALOR: Record<Motivo, number> = { espera: 100000000, km_rota: 100000001, valor: 100000002, passageiro: 100000003, outro: 100000004 }

const doValor = <K extends string>(map: Record<K, number>, value: unknown): K | null =>
  (Object.keys(map) as K[]).find((k) => map[k] === value) ?? null
export const statusDoValor = (v: unknown) => doValor(STATUS_VALOR, v)
export const fechamentoDoValor = (v: unknown) => doValor(FECHAMENTO_VALOR, v) ?? 'pendente'
export const motivoDoValor = (v: unknown) => doValor(MOTIVO_VALOR, v)

const SITUACAO: Record<Situacao, { label: string; tone: StatusTone }> = {
  a_liberar: { label: 'A liberar', tone: 'neutral' },
  liberado: { label: 'Liberado', tone: 'info' },
  em_duvida: { label: 'Em dúvida', tone: 'warning' },
  respondido: { label: 'Respondido', tone: 'info' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  aprovado_tacito: { label: 'Aprovado automaticamente', tone: 'success' },
  retirado: { label: 'Retirado', tone: 'neutral' },
}
export const SITUACOES = Object.keys(SITUACAO) as Situacao[]
export const situacaoLabel = (s: Situacao) => SITUACAO[s].label
export const situacaoTone = (s: Situacao) => SITUACAO[s].tone

const MOTIVO_LABEL: Record<Motivo, string> = { espera: 'Espera', km_rota: 'Km/rota', valor: 'Valor', passageiro: 'Passageiro', outro: 'Outro' }
export const motivoLabel = (m: Motivo) => MOTIVO_LABEL[m]

/** A Juliana responde enquanto há dúvida aberta ou complementa a própria resposta. */
export const podeResponder = (s: Situacao) => s === 'em_duvida' || s === 'respondido'
/** Retirar só antes da aprovação; aprovado fica para o fechamento decidir. */
export const podeRetirar = (s: Situacao) => s === 'liberado' || s === 'em_duvida' || s === 'respondido'
/** Liberar: o que ainda não foi liberado ou foi retirado (volta no mesmo registro). */
export const podeLiberar = (s: Situacao) => s === 'a_liberar' || s === 'retirado'
/** A observação ao cliente só muda enquanto o serviço está no portal esperando decisão. */
export const podeEditarObservacao = podeRetirar
/** Vai ao fechamento só o que já foi liberado e não retirado. */
export const podeMarcarFechamento = (s: Situacao) => s !== 'a_liberar' && s !== 'retirado'

// Prazo da aprovação tácita: 5 dias úteis, sem sábado, domingo e feriados nacionais, em America/Sao_Paulo
// (UTC-3 fixo desde 2019). Mesma regra de pages/geral/domain/portal.ts e apps/portal-cliente/src/domain/regras.ts.
export const DIAS_TACITA = 5
const OFFSET_MS = 3 * 3_600_000
const DIA_MS = 24 * 3_600_000
const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']

/** Domingo de Páscoa (Meeus/Jones/Butcher), como timestamp UTC à meia-noite. */
function pascoa(ano: number): number {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(ano, mes - 1, dia)
}

const feriados = new Map<number, Set<string>>()
function feriadosNacionais(ano: number): Set<string> {
  let set = feriados.get(ano)
  if (!set) {
    set = new Set([...FIXOS.map((d) => `${ano}-${d}`), new Date(pascoa(ano) - 2 * DIA_MS).toISOString().slice(0, 10)])
    feriados.set(ano, set)
  }
  return set
}

function ehDiaUtil(ms: number): boolean {
  const d = new Date(ms)
  const semana = d.getUTCDay()
  return semana !== 0 && semana !== 6 && !feriadosNacionais(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))
}

/** Dia local (yyyy-mm-dd, America/Sao_Paulo) de um instante ISO. */
export const diaLocal = (iso: string) => new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(0, 10)

/** O `dias`-ésimo dia útil depois do dia local de `inicioIso` (o próprio dia não conta), como yyyy-mm-dd. */
export function prazoTacita(inicioIso: string, dias = DIAS_TACITA): string {
  let ms = Date.parse(`${diaLocal(inicioIso)}T00:00:00Z`)
  for (let contados = 0; contados < dias; ) {
    ms += DIA_MS
    if (ehDiaUtil(ms)) contados++
  }
  return new Date(ms).toISOString().slice(0, 10)
}

/** Prazo vencido: só conta enquanto o serviço espera o cliente. */
export const prazoVencido = (l: Pick<Linha, 'situacao' | 'prazoTacita'>, hoje: string) =>
  (l.situacao === 'liberado' || l.situacao === 'respondido') && !!l.prazoTacita && l.prazoTacita < hoje

/** Efeito de "Enviar resposta": status vai para Respondido e o prazo da tácita reinicia a partir de agora. */
export function aplicarResposta(l: Linha, agoraIso: string): { situacao: 'respondido'; prazoTacita: string } {
  if (!podeResponder(l.situacao)) throw new Error(`Não há dúvida aberta neste serviço (${situacaoLabel(l.situacao)}).`)
  return { situacao: 'respondido', prazoTacita: prazoTacita(agoraIso) }
}

/** Efeito de "Liberar para o portal": Liberado, prazo aberto, valor da composição e aprovação anterior limpa. */
export function aplicarLiberacao(l: Linha, agoraIso: string, observacao: string): Pick<Linha, 'situacao' | 'prazoTacita' | 'liberadoEm' | 'valorLiberado' | 'observacao' | 'aprovadoEm' | 'aprovadoPor'> {
  if (!podeLiberar(l.situacao)) throw new Error(`O serviço ${l.codigo} já está no portal (${situacaoLabel(l.situacao)}).`)
  return { situacao: 'liberado', prazoTacita: prazoTacita(agoraIso), liberadoEm: agoraIso, valorLiberado: l.valorComposicao, observacao: observacao.trim(), aprovadoEm: null, aprovadoPor: '' }
}

/** Aprovado (explícito ou automático) entra no fechamento por padrão enquanto a Juliana não decidiu. */
export const fechamentoSugerido = (l: Pick<Linha, 'situacao' | 'fechamento'>) =>
  l.fechamento === 'pendente' && (l.situacao === 'aprovado' || l.situacao === 'aprovado_tacito')

/** Vai para o Excel do mês: marcado "Sim" ou sugerido; retirado e "a liberar" nunca. */
export const entraNoFechamento = (l: Pick<Linha, 'situacao' | 'fechamento'>) =>
  l.situacao !== 'retirado' && l.situacao !== 'a_liberar' && (l.fechamento === 'sim' || fechamentoSugerido(l))

/** Mês do serviço (yyyy-mm), que define o fechamento em que ele entra. */
export const mesDe = (l: Pick<Linha, 'data'>) => (l.data ? l.data.slice(0, 7) : null)

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
/** `2026-10` → `outubro/2026`. */
export const mesLabel = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes}/${mes.slice(0, 4)}`

/** Linhas do Excel: do cliente e do mês, que entram no fechamento, por data e código. */
export function linhasDoFechamento(linhas: Linha[], clienteId: string, mes: string): Linha[] {
  return linhas
    .filter((l) => l.cliente.id === clienteId && mesDe(l) === mes && entraNoFechamento(l))
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
}

/** Valor que vai para o fechamento: o liberado; sem ele, o da composição. */
export const valorFechamento = (l: Pick<Linha, 'valorLiberado' | 'valorComposicao'>) => l.valorLiberado ?? l.valorComposicao ?? 0

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Erros do cadastro de validador; o e-mail é único em todos os clientes. */
export function validarValidador(v: { nome: string; email: string; clienteId: string }, emails: string[]): Partial<Record<'nome' | 'email' | 'clienteId', string>> {
  const errors: Partial<Record<'nome' | 'email' | 'clienteId', string>> = {}
  const email = v.email.trim().toLowerCase()
  if (!v.nome.trim()) errors.nome = 'Informe o nome do validador.'
  if (!email) errors.email = 'Informe o e-mail do validador.'
  else if (!EMAIL.test(email)) errors.email = 'Use um e-mail válido, como nome@tenaris.com.'
  else if (emails.some((e) => e.toLowerCase() === email)) errors.email = 'Este e-mail já é validador.'
  if (!v.clienteId) errors.clienteId = 'Escolha o cliente.'
  return errors
}
