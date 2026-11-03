import type { StatusTone } from '@betinhos/ui'
import type { AttributeInfo, CellKind, Column } from './types'

/** Nunca editáveis na célula: identificação, auditoria, campos VIEW gerados por flow e voucher. */
export const READONLY: ReadonlySet<string> = new Set([
  'cr40f_id', 'cr40f_idjuntado', 'cr40f_idnovo', 'cr40f_reservadeveculosid', 'createdon', 'createdby', 'modifiedon', 'modifiedby', 'ownerid', 'cr40f_criadopor', 'cr40f_modificadopor',
  'cr40f_passageirosetelefonedecontato', 'cr40f_endereodesada', 'cr40f_perfildopassageiro', 'new_linkdovoucher', 'statecode', 'statuscode',
])

/** Onde editar o que a célula só mostra. Passageiros: o plugin DriverRecordSharing monta o texto a partir dos vínculos e do cadastro. */
const READONLY_HINTS: Record<string, string> = {
  cr40f_passageirosetelefonedecontato: 'Edite pelos passageiros da OS.',
}

export function readonlyHint(column: Column): string | null {
  return column.alias ? null : READONLY_HINTS[column.attribute] ?? null
}

/** Aviso do editor de motorista: a troca dispara avisos e a atribuição automática de veículo no Dataverse. */
export const MOTORISTA_TITLE = 'Trocar o motorista dispara os avisos e a atribuição automática de veículo.'

const KINDS: Record<string, CellKind> = {
  Picklist: 'choice', Lookup: 'lookup', DateTime: 'datetime', String: 'text', Memo: 'memo', Money: 'money', Boolean: 'boolean',
}

export function cellKind(column: Column, info: AttributeInfo | undefined): CellKind {
  if (column.alias || !info || !info.updatable || READONLY.has(column.attribute)) return 'readonly'
  return KINDS[info.type] ?? 'readonly'
}

// Valores reais das choices de cr40f_reservadeveculos (metadata DEV 08/10/2026); rótulos vêm da metadata.
const STATUS: Record<number, StatusTone> = {
  202410001: 'success', 202410005: 'success', 202410008: 'success',            // Confirmado, Programado, Concluído
  202410002: 'danger', 202410010: 'danger',                                    // Cancelado, Cancelado com Ressalvas
  100000001: 'warning', 202410000: 'warning', 202410004: 'warning',            // Requer Análise, Pré-reserva, Solicitado
  202410006: 'info',                                                           // Em Execução
}
const FATURAMENTO: Record<number, StatusTone> = {
  202410010: 'success', 100000001: 'success', 202410008: 'success',            // Pago, Composição Realizada, Faturamento Mensal
  202410012: 'danger', 202410002: 'danger',                                    // Pagamento Em Atraso, Cancelado Com Taxa
  202410005: 'warning', 202410007: 'warning', 202410006: 'warning',            // Pendente, Pagamento Pendente, Pagante em Viagem
}

export function statusTone(attribute: string, value: number | null): StatusTone {
  if (value == null) return 'neutral'
  if (attribute === 'cr40f_status') return STATUS[value] ?? 'neutral'
  if (attribute === 'cr40f_statusdefaturamento') return FATURAMENTO[value] ?? 'neutral'
  return 'neutral'
}

const BADGE_COLUMNS: ReadonlySet<string> = new Set(['cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_tipodeveiculo'])

/** Colunas mostradas como etiqueta colorida (status e tipo de serviço) quando o valor é uma choice preenchida. */
export function isBadgeValue(column: Column, value: unknown): value is number {
  return !column.alias && BADGE_COLUMNS.has(column.attribute) && typeof value === 'number'
}

/** Tipo de serviço (cr40f_tipodeveiculo): cor por rótulo, para bater o olho na operação; rótulo novo cai numa cor estável pelo texto. */
const TIPO_FIXOS: ReadonlyMap<string, number> = new Map([['executivo', 1], ['basico', 2], ['van', 3], ['blindado', 4], ['somente motorista', 5]])

export function tipoVariant(label: string): number {
  const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const fixo = TIPO_FIXOS.get(key)
  if (fixo) return fixo
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % 6) + 1
}

/** Cor (#RRGGBB) cadastrada na choice para o valor; `null` quando não há (a tela cai nas cores padrão). */
export function choiceColor(info: AttributeInfo | undefined, value: unknown): string | null {
  if (typeof value !== 'number') return null
  return info?.options.find((option) => option.value === value)?.color ?? null
}
