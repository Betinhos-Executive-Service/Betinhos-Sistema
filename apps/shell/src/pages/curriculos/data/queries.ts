import { cleanId, type DataverseClient, type Row } from '@betinhos/dataverse'
import { FIELDS } from '../domain/form'
import type { Curriculo } from '../domain/types'

export const ENTITY = 'new_curriculo'
const SELECT = ['new_curriculoid', ...Object.values(FIELDS), 'createdon']

/** Todas as linhas ativas; o getAll segue o @odata.nextLink. */
export function curriculosPath(entitySet: string) {
  return `${entitySet}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent('statecode eq 0')}&$orderby=${encodeURIComponent('createdon desc')}`
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Usa os valores crus: os rótulos das choices vêm do ChoiceSet na hora de mostrar. */
export function mapCurriculo(row: Row): Curriculo {
  return {
    id: cleanId(str(row.new_curriculoid)),
    nome: str(row.new_nomecompleto), cpf: str(row.new_cpf), email: str(row.new_email), telefone: str(row.new_telefone),
    whatsapp: str(row.new_whatsapp), cidade: str(row.new_cidade), estado: str(row.new_estado), cargo: str(row.new_cargointeresse),
    experiencia: str(row.new_experiencia), ultimoCargo: str(row.new_ultimocargo), ultimaEmpresa: str(row.new_ultimaempresa),
    pretensao: num(row.new_pretensaosalarial), nota: num(row.new_nota), indicadoPor: str(row.new_indicadopor),
    disponibilidade: num(row.new_disponibilidade), cnh: num(row.new_categoriacnh), origem: num(row.new_origemcurriculo),
    status: num(row.new_statuscurriculo), link: str(row.new_linkcurriculo), observacoes: str(row.new_observacoes),
    criadoEm: typeof row.createdon === 'string' ? new Date(row.createdon) : null,
  }
}

export async function loadCurriculos(client: DataverseClient, entitySet: string) {
  return (await client.getAll(curriculosPath(entitySet))).map(mapCurriculo)
}
