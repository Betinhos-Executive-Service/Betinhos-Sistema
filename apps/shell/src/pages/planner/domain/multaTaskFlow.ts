import { MULTA } from '../../frota/data/schema'

/** Mesmo padrão de QUOTE_TASK_DONE_BLOCKED: a tarefa da multa é fechada pelo plugin da frota (MultaTarefa), nunca à mão. */
export const MULTA_TASK_DONE_BLOCKED = 'A tarefa fecha sozinha quando a multa for encerrada.'

const FECHADA: ReadonlySet<number> = new Set([MULTA.FINALIZADO, MULTA.DESCONTADO, MULTA.CANCELADA])

export function isMultaTask(task: { multaId?: unknown; sourceType?: unknown } = {}): boolean {
  return Boolean(task.multaId || task.sourceType === 'multa')
}

export const multaFechada = (status: unknown): boolean => typeof status === 'number' && FECHADA.has(status)

export const multaHref = (multaId: string) => `#/frota-multas?registro=multa:${String(multaId).replace(/[{}]/g, '').toLowerCase()}`
