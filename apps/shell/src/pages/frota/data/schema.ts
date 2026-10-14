import { NAO_INFORMADO } from './format'
import type { Kind, TableKey } from './types'

export type Option = { value: number; label: string }
export type Tone = 'success' | 'warning' | 'neutral' | 'info' | 'danger'

export const TABLE: Record<TableKey, string> = {
  veiculos: 'cr40f_veiculos',
  manutencoes: 'cr40f_manutencoes',
  multas: 'cr40f_multas',
  infracoes: 'cr40f_infracaodetransito',
  colisoes: 'cr40f_colisao_v2',
  posses: 'new_possedeveiculo',
  planoPreventivo: 'cr40f_itemplanopreventivo',
  baselines: 'cr40f_baselinepreventiva',
  despesasCombustivel: 'cr40f_despesaoperacional',
  telemetriaKm: 'new_telemetriadiariainfleet',
}

/** Entity sets usados nos @odata.bind. */
// confirmar no DEV após provisionar
export const ENTITY_SET = { veiculos: 'cr40f_veiculoses', planoPreventivo: 'cr40f_itemplanopreventivos' } as const

export const CATEGORIA_DESPESA_TABLE = 'cr40f_categoriadespesaoperacional'
export const ITEM_PLANO = { nome: 'cr40f_name', servico: 'cr40f_servico', intervaloKm: 'cr40f_intervalokm', intervaloMeses: 'cr40f_intervalomeses', avisoKm: 'cr40f_avisokm', avisoDias: 'cr40f_avisodias' } as const
export const BASELINE = { nome: 'cr40f_name', veiculo: 'cr40f_Veiculo@odata.bind', item: 'cr40f_Item@odata.bind', km: 'cr40f_km', data: 'cr40f_data' } as const
export const AVISO_PADRAO = { km: 1000, dias: 30 } as const

export const KIND_TABLE: Record<Kind, string> = { manutencao: 'cr40f_manutencoes', multa: 'cr40f_multas', colisao: 'cr40f_colisao_v2' }
export const KIND_ID: Record<Kind, string> = { manutencao: 'cr40f_manutencoesid', multa: 'cr40f_multasid', colisao: 'cr40f_colisao_v2id' }
export const STATUS_FIELD: Record<Kind, string> = { manutencao: 'cr40f_status', multa: 'cr40f_status', colisao: 'cr40f_statusoperacional' }
export const KIND_LABEL: Record<Kind, string> = { manutencao: 'Manutenção', multa: 'Multa', colisao: 'Colisão' }

export const MANUT = { SOLICITADO: 0, APROVADO: 202410001, PROGRAMADO: 202410005, REALIZADO: 202410002, REPROVADO: 100000002, CANCELADO: 100000001 } as const
export const MULTA = { NOTIFICAR: 202410000, INDICADA: 202410001, RECURSO: 202410002, DESCONTADO: 202410003, NOTIFICADO: 202410004, FINALIZADO: 202410005, PAGO: 202410006 } as const
export const COLISAO = { ENVIADO: 100000000, ANALISE: 100000001, RESOLVIDO: 100000002, CANCELADO: 100000003 } as const
export const VEICULO = { VENDIDO: 202410000, ATIVO: 202410001 } as const

export const STATUS_OPTIONS: Record<Kind, Option[]> = {
  manutencao: [
    { value: MANUT.SOLICITADO, label: 'Solicitado' },
    { value: MANUT.APROVADO, label: 'Aprovado' },
    { value: MANUT.PROGRAMADO, label: 'Programado' },
    { value: MANUT.REALIZADO, label: 'Realizado' },
    { value: MANUT.REPROVADO, label: 'Reprovado' },
    { value: MANUT.CANCELADO, label: 'Cancelado' },
  ],
  multa: [
    { value: MULTA.NOTIFICAR, label: 'Notificar o Condutor' },
    { value: MULTA.NOTIFICADO, label: 'Condutor Notificado' },
    { value: MULTA.INDICADA, label: 'Indicada' },
    { value: MULTA.RECURSO, label: 'Recurso' },
    { value: MULTA.DESCONTADO, label: 'Descontado' },
    { value: MULTA.PAGO, label: 'Pago' },
    { value: MULTA.FINALIZADO, label: 'Finalizado' },
  ],
  colisao: [
    { value: COLISAO.ENVIADO, label: 'Enviado' },
    { value: COLISAO.ANALISE, label: 'Em análise' },
    { value: COLISAO.RESOLVIDO, label: 'Resolvido' },
    { value: COLISAO.CANCELADO, label: 'Cancelado' },
  ],
}

export const TONE: Record<Kind, Record<number, Tone>> = {
  manutencao: { [MANUT.SOLICITADO]: 'warning', [MANUT.APROVADO]: 'info', [MANUT.PROGRAMADO]: 'info', [MANUT.REALIZADO]: 'success', [MANUT.REPROVADO]: 'danger', [MANUT.CANCELADO]: 'neutral' },
  multa: { [MULTA.NOTIFICAR]: 'warning', [MULTA.NOTIFICADO]: 'info', [MULTA.INDICADA]: 'info', [MULTA.RECURSO]: 'warning', [MULTA.DESCONTADO]: 'success', [MULTA.PAGO]: 'success', [MULTA.FINALIZADO]: 'neutral' },
  colisao: { [COLISAO.ENVIADO]: 'warning', [COLISAO.ANALISE]: 'info', [COLISAO.RESOLVIDO]: 'success', [COLISAO.CANCELADO]: 'neutral' },
}

export const GRAU: Option[] = [{ value: 1, label: 'Baixa' }, { value: 2, label: 'Média' }, { value: 3, label: 'Alta' }, { value: 4, label: 'Urgente' }]
export const TIPO_REPARO: Option[] = [
  { value: 1, label: 'Preventiva sistemática' },
  { value: 2, label: 'Corretiva não crítica' },
  { value: 100000001, label: 'Corretiva crítica' },
  { value: 100000002, label: 'Conservação, conforto e imagem' },
  { value: 100000003, label: 'Avaria' },
]
export const VEICULO_STATUS: Option[] = [{ value: VEICULO.ATIVO, label: 'Ativo' }, { value: VEICULO.VENDIDO, label: 'Vendido' }]
/** Opção "Próprio" de CATEGORIA. */
export const PROPRIO = 100000000
export const CATEGORIA: Option[] = [{ value: 100000000, label: 'Próprio' }, { value: 100000001, label: 'Terceiro' }, { value: 100000002, label: 'Aluguel' }]
export const GRAVIDADE: Option[] = [{ value: 0, label: 'Leve' }, { value: 1, label: 'Média' }, { value: 2, label: 'Grave' }, { value: 3, label: 'Gravíssima' }]
export const TIPO_COLISAO: Option[] = [{ value: 100000000, label: 'Eu bati' }, { value: 100000001, label: 'Bateram em mim' }]

export function label(options: Option[], value: number | null, fallback = NAO_INFORMADO) {
  return options.find((option) => option.value === value)?.label ?? fallback
}
