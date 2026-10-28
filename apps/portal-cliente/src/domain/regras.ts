import type { StatusTone } from '@betinhos/ui'
import type { Motivo, Servico, Status } from './types'

/**
 * Feriados nacionais que não contam como dia útil para a aprovação tácita. Lista fixa só até 2027:
 * no portal real o prazo é calculado no servidor (Worker), com a lista mantida lá.
 */
const FERIADOS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-03-26', '2027-04-21', '2027-05-01', '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
])

export const DIAS_TACITA = 5

// America/Sao_Paulo não tem horário de verão desde 2019: UTC-3 fixo.
const OFFSET_MS = 3 * 60 * 60 * 1000
export const DIA_MS = 24 * 60 * 60 * 1000

/** Data local (yyyy-mm-dd) em America/Sao_Paulo. */
export function diaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(0, 10)
}

/** Dias corridos como timestamps UTC à meia-noite, para somar sem criar strings a cada passo. */
const paraMs = (dia: string) => Date.parse(`${dia}T00:00:00Z`)
const paraDia = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function ehDiaUtil(ms: number): boolean {
  const semana = new Date(ms).getUTCDay()
  return semana !== 0 && semana !== 6 && !FERIADOS.has(paraDia(ms))
}

/** O `dias`-ésimo dia útil depois do dia de `inicioIso` (o próprio dia não conta). */
export function somarDiasUteis(inicioIso: string, dias: number): string {
  let ms = paraMs(diaLocal(inicioIso))
  for (let contados = 0; contados < dias; ) {
    ms += DIA_MS
    if (ehDiaUtil(ms)) contados++
  }
  return paraDia(ms)
}

/** Dias úteis entre hoje e o prazo (o prazo conta, hoje não). 0 = vence hoje; nunca negativo. */
export function diasUteisRestantes(prazo: string, agoraIso: string): number {
  const fim = paraMs(prazo)
  let n = 0
  for (let ms = paraMs(diaLocal(agoraIso)) + DIA_MS; ms <= fim; ms += DIA_MS) if (ehDiaUtil(ms)) n++
  return n
}

export function podeAprovar(s: Pick<Servico, 'status'>): boolean {
  return s.status === 'liberado' || s.status === 'em_duvida' || s.status === 'respondido'
}

/** Depende do cliente: liberado ou com resposta da Betinhos. */
export function aguardaCliente(s: Pick<Servico, 'status'>): boolean {
  return s.status === 'liberado' || s.status === 'respondido'
}

const STATUS: Record<Status, { rotulo: string; tom: StatusTone }> = {
  liberado: { rotulo: 'Aguardando validação', tom: 'info' },
  em_duvida: { rotulo: 'Em dúvida', tom: 'warning' },
  respondido: { rotulo: 'Betinhos respondeu', tom: 'info' },
  aprovado: { rotulo: 'Aprovado', tom: 'success' },
  aprovado_tacito: { rotulo: 'Aprovado automaticamente', tom: 'success' },
}

export function statusInfo(status: Status) {
  return STATUS[status]
}

const MOTIVO_LABEL: Record<Motivo, string> = {
  espera: 'Tempo de espera',
  km_rota: 'Km ou rota',
  valor: 'Valor cobrado',
  passageiro: 'Passageiro',
  outro: 'Outro',
}

export const MOTIVOS = (Object.keys(MOTIVO_LABEL) as Motivo[]).map((value) => ({ value, label: MOTIVO_LABEL[value] }))

export function motivoLabel(m: Motivo): string {
  return MOTIVO_LABEL[m]
}
