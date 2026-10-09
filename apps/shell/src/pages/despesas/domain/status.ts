import type { StatusTone } from '@betinhos/ui'
import type { Despesa, DespesaChoices } from './types'

/** Choices de `cr40f_despesaoperacional` (metadata de DEV em 09/10/2026). */
export const OPERACIONAL = { enviado: 100000000, corrigir: 100000001, validado: 100000002, recusado: 100000003, cancelado: 100000004 } as const
export const FINANCEIRO = { naoReembolsavel: 100000000, aguardando: 100000001, pago: 100000002, cancelado: 100000003 } as const
export const ANEXO = { sem: 100000000, enviando: 100000001, completo: 100000002, falhou: 100000003, parcial: 100000004 } as const

/** Rótulos de DEV; só entram se a metadata não responder. */
export const FALLBACK_CHOICES: DespesaChoices = {
  operacional: [
    { value: OPERACIONAL.enviado, label: 'Enviado' }, { value: OPERACIONAL.corrigir, label: 'Precisa corrigir' },
    { value: OPERACIONAL.validado, label: 'Validado' }, { value: OPERACIONAL.recusado, label: 'Recusado' }, { value: OPERACIONAL.cancelado, label: 'Cancelado' },
  ],
  financeiro: [
    { value: FINANCEIRO.naoReembolsavel, label: 'Não reembolsável' }, { value: FINANCEIRO.aguardando, label: 'Aguardando pagamento' },
    { value: FINANCEIRO.pago, label: 'Pago' }, { value: FINANCEIRO.cancelado, label: 'Cancelado' },
  ],
  anexo: [
    { value: ANEXO.sem, label: 'Sem anexo' }, { value: ANEXO.enviando, label: 'Enviando' }, { value: ANEXO.completo, label: 'Completo' },
    { value: ANEXO.falhou, label: 'Falhou' }, { value: ANEXO.parcial, label: 'Parcial' },
  ],
  origem: [
    { value: 100000000, label: 'App Motoristas' }, { value: 100000001, label: 'Model-driven' }, { value: 100000002, label: 'Flow' }, { value: 100000003, label: 'Importação' },
  ],
  anexoTipo: [{ value: 100000000, label: 'Comprovante' }, { value: 100000001, label: 'Foto complementar' }, { value: 100000002, label: 'Outros' }],
  anexoStatus: [
    { value: 100000000, label: 'Pendente' }, { value: 100000001, label: 'Enviado' }, { value: 100000002, label: 'Falhou' },
    { value: 100000003, label: 'Inválido' }, { value: 100000004, label: 'Processando' },
  ],
}

export function withFallback(choices: Partial<DespesaChoices>): DespesaChoices {
  const pick = (key: keyof DespesaChoices) => (choices[key]?.length ? choices[key]! : FALLBACK_CHOICES[key])
  return {
    operacional: pick('operacional'), financeiro: pick('financeiro'), anexo: pick('anexo'),
    origem: pick('origem'), anexoTipo: pick('anexoTipo'), anexoStatus: pick('anexoStatus'),
  }
}

/** Mesmo critério do Dashboard (aba Despesas): sem anexo completo. */
export const semComprovante = (d: Pick<Despesa, 'statusAnexo'>) => d.statusAnexo !== ANEXO.completo

export function operacionalTone(status: number | null): StatusTone {
  if (status === OPERACIONAL.validado) return 'success'
  if (status === OPERACIONAL.corrigir) return 'warning'
  if (status === OPERACIONAL.recusado) return 'danger'
  if (status === OPERACIONAL.enviado) return 'info'
  return 'neutral'
}

export function financeiroTone(status: number | null): StatusTone {
  if (status === FINANCEIRO.pago) return 'success'
  if (status === FINANCEIRO.aguardando) return 'warning'
  return 'neutral'
}

/** `cr40f_status` do arquivo: Pendente, Enviado, Falhou, Inválido, Processando. */
export function arquivoTone(status: number | null): StatusTone {
  if (status === 100000001) return 'success'
  if (status === 100000002 || status === 100000003) return 'danger'
  if (status === 100000000 || status === 100000004) return 'warning'
  return 'neutral'
}
