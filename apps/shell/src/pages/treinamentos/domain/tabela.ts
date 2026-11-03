import { PUBLICO, fmtDia, isPublicado, plural, publicoLabel, resolverPublico, type Funcionario, type Treinamento } from './treinamentos'

/** Regras de apresentação da tabela de treinamentos (funções puras). */

const MS_DIA = 86_400_000
const diaUtc = (dia: string) => Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)))
const diasAte = (dia: string, hoje: string) => Math.round((diaUtc(dia) - diaUtc(hoje)) / MS_DIA)
/** Dia (`AAAA-MM-DD`) de um instante no fuso de São Paulo. */
const diaSp = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(value)

export const JANELA_A_VENCER = 7

export type ValidadeInfo = { estado: 'vencido' | 'avencer' | 'ok'; texto: string; completa: string }

/** Validade com urgência em texto (nunca só cor). Rascunho não alerta: ainda não há prazo correndo. */
export function validadeDe(item: Treinamento, hoje: string): ValidadeInfo | null {
  if (!item.validade) return null
  const completa = fmtDia(item.validade)
  if (!isPublicado(item)) return { estado: 'ok', texto: `Prazo ${completa}`, completa }
  const dias = diasAte(item.validade, hoje)
  if (dias < 0) return { estado: 'vencido', texto: dias === -1 ? 'Venceu ontem' : `Venceu há ${-dias} dias`, completa }
  if (dias === 0) return { estado: 'avencer', texto: 'Vence hoje', completa }
  if (dias === 1) return { estado: 'avencer', texto: 'Vence amanhã', completa }
  if (dias <= JANELA_A_VENCER) return { estado: 'avencer', texto: `Vence em ${dias} dias`, completa }
  return { estado: 'ok', texto: `Vence em ${completa}`, completa }
}

/** "Hoje", "Ontem", "Há N dias" (até 6) ou a data; a completa vai no tooltip. */
export function dataCurta(value: string | null, agora = new Date()): string {
  if (!value) return ''
  const dias = diasAte(diaSp(new Date(value)), diaSp(agora))
  if (dias === 0) return 'Hoje'
  if (dias === -1) return 'Ontem'
  if (dias < 0 && dias > -7) return `Há ${-dias} dias`
  return fmtDia(diaSp(new Date(value)))
}

export type ProgressoConta = { concluidos: number; total: number }
/** Agrupa participações (id do treinamento + concluída) em contagens por treinamento. */
export function contarProgresso(linhas: { treinamentoId: string; concluida: boolean }[]): Record<string, ProgressoConta> {
  const mapa: Record<string, ProgressoConta> = {}
  for (const { treinamentoId, concluida } of linhas) {
    const conta = (mapa[treinamentoId] ??= { concluidos: 0, total: 0 })
    conta.total += 1
    if (concluida) conta.concluidos += 1
  }
  return mapa
}

export type ProgressoInfo = { pct: number; texto: string; completo: boolean }

export function progressoDe(conta: ProgressoConta | undefined): ProgressoInfo | null {
  if (!conta || conta.total <= 0) return null
  const { concluidos, total } = conta
  return { pct: Math.round((concluidos / total) * 100), texto: `${concluidos} de ${total} ${plural(total, 'concluiu', 'concluíram')}`, completo: concluidos >= total }
}

export type Exigencia = { key: 'assinatura' | 'quiz' | 'leitura'; label: string }

export function exigenciasDe(item: Pick<Treinamento, 'exigeAssinatura' | 'exigeQuiz'>): Exigencia[] {
  const lista: Exigencia[] = []
  if (item.exigeAssinatura) lista.push({ key: 'assinatura', label: 'Assinatura' })
  if (item.exigeQuiz) lista.push({ key: 'quiz', label: 'Quiz' })
  return lista.length ? lista : [{ key: 'leitura', label: 'Leitura' }]
}

/** Público em duas linhas: quem (nomes ou grupo) e quantos funcionários ativos recebem. */
export function publicoCelula(item: Pick<Treinamento, 'publicoTipo' | 'publico'>, funcionarios: Funcionario[]) {
  if (item.publicoTipo !== PUBLICO.motoristas && !item.publico.length) return { principal: 'Público não definido', detalhe: '' }
  const n = funcionarios.length ? resolverPublico(item, funcionarios).length : 0
  return { principal: publicoLabel(item, funcionarios), detalhe: n ? `${n} ${plural(n, 'funcionário', 'funcionários')}` : '' }
}
