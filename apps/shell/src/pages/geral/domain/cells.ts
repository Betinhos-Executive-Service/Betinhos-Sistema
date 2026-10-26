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
