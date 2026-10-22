import { cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import { FUNC_DESLIGADO } from '../../documentos/domain/codes'
import type { Changes } from '../domain/form'
import type { Foto } from '../domain/fotos'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'

export const ENTITIES = { equipamento: 'cr40f_equipamento', tipo: 'cr40f_tipoequipamento', funcionario: 'cr40f_funcionarios' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Fotos ficam fora de ENTITIES: sem a tabela (antes do provision) a lista funciona e só a seção Fotos mostra o erro. */
export const FOTO_ENTITY = 'cr40f_fotoequipamento'
/** Propriedades de navegação dos lookups (SchemaName criado por provision-equipamentos.ps1). */
export const NAV = { tipo: 'cr40f_Tipo', responsavel: 'cr40f_Responsavel', fotoEquipamento: 'cr40f_Equipamento' } as const

const SELECT = [
  'cr40f_equipamentoid', 'cr40f_name', '_cr40f_tipo_value', 'cr40f_marcamodelo', 'cr40f_numeroserie', 'cr40f_status',
  '_cr40f_responsavel_value', 'cr40f_datacompra', 'cr40f_valorcompra', 'cr40f_observacoes', 'modifiedon',
]

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const text = (v: unknown) => { const t = str(v).trim(); return /^(null|undefined)$/i.test(t) ? '' : t }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const order = (column: string) => `&$orderby=${encodeURIComponent(`${column} asc`)}`

export const equipamentosPath = (set: string) => `${set}?$select=${SELECT.join(',')}${order('cr40f_name')}`
export const tiposPath = (set: string) => `${set}?$select=cr40f_tipoequipamentoid,cr40f_name,statecode${order('cr40f_name')}`
/** Ativos e inativos: o item de um funcionário desligado continua mostrando o nome, com selo. */
export const pessoasPath = (set: string) => `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_status,statecode${order('cr40f_nomecompleto')}`

export function mapEquipamento(row: Row): Equipamento {
  const lookupId = (k: string) => (row[k] ? cleanId(str(row[k])) : null)
  const lookupName = (k: string) => (row[k] ? formatted(row, k) : '')
  return {
    id: cleanId(str(row.cr40f_equipamentoid)), descricao: text(row.cr40f_name),
    tipoId: lookupId('_cr40f_tipo_value'), tipoNome: lookupName('_cr40f_tipo_value'),
    marcaModelo: text(row.cr40f_marcamodelo), numeroSerie: text(row.cr40f_numeroserie), status: num(row.cr40f_status),
    responsavelId: lookupId('_cr40f_responsavel_value'), responsavelNome: lookupName('_cr40f_responsavel_value'),
    dataCompra: text(row.cr40f_datacompra).slice(0, 10) || null, valorCompra: num(row.cr40f_valorcompra),
    observacoes: text(row.cr40f_observacoes), modificadoEm: date(row.modifiedon), capa: null,
  }
}

export const mapTipo = (row: Row): TipoEquipamento => ({ id: cleanId(str(row.cr40f_tipoequipamentoid)), nome: text(row.cr40f_name), ativo: row.statecode !== 1 })
/**
 * Inativo = registro inativo (statecode 1) ou desligado (`cr40f_status` 1; o desligamento não mexe no statecode).
 * Afastado (2) continua ativo, como em Documentos.
 */
export const mapPessoa = (row: Row): Pessoa => ({
  id: cleanId(str(row.cr40f_funcionariosid)), nome: text(row.cr40f_nomecompleto), ativo: row.statecode !== 1 && row.cr40f_status !== FUNC_DESLIGADO,
})

/** Lookups novos por @odata.bind; limpar o responsável é DELETE no $ref (`responsavelRefPath`), nunca bind null. */
export function toPayload(c: Changes, sets: EntitySets): Row {
  const p: Row = { ...c.campos }
  if (c.tipoId) p[`${NAV.tipo}@odata.bind`] = `/${sets.tipo}(${cleanId(c.tipoId)})`
  if (c.responsavelId) p[`${NAV.responsavel}@odata.bind`] = `/${sets.funcionario}(${cleanId(c.responsavelId)})`
  return p
}

export const responsavelRefPath = (set: string, id: string) => `${set}(${cleanId(id)})/${NAV.responsavel}/$ref`

/** Inativar/reativar tipo mexe só no estado; o statuscode acompanha (Ativo 1, Inativo 2). */
export const estadoPayload = (ativo: boolean): Row => ({ statecode: ativo ? 0 : 1, statuscode: ativo ? 1 : 2 })

/**
 * Fotos (`cr40f_fotoequipamento`): o registro guarda só o nome, o caminho do arquivo no SharePoint e a capa.
 * A imagem não passa pelo Dataverse; a tela baixa pelo flow Consultar só o que aparece.
 */
export const FOTO_MAX_CAMINHO = 400
const FOTO_SELECT = ['cr40f_fotoequipamentoid', 'cr40f_name', '_cr40f_equipamento_value', 'cr40f_capa', 'cr40f_caminho', 'createdon']

export const fotosPath = (set: string, equipamentoId: string) =>
  `${set}?$select=${FOTO_SELECT.join(',')}&$filter=${encodeURIComponent(`_cr40f_equipamento_value eq ${cleanId(equipamentoId)}`)}${order('createdon')}`
/** Só as capas, para a miniatura da lista (as demais fotos só no drawer). Mais antiga primeiro: com duas marcadas, vale a primeira. */
export const capasPath = (set: string) =>
  `${set}?$select=_cr40f_equipamento_value,cr40f_caminho,createdon&$filter=${encodeURIComponent('cr40f_capa eq true')}${order('createdon')}`

export function mapFoto(row: Row): Foto {
  return {
    id: cleanId(str(row.cr40f_fotoequipamentoid)), equipamentoId: row._cr40f_equipamento_value ? cleanId(str(row._cr40f_equipamento_value)) : '',
    nome: text(row.cr40f_name) || 'Foto', capa: row.cr40f_capa === true, criadoEm: date(row.createdon), caminho: text(row.cr40f_caminho),
  }
}

/** Caminho da primeira capa de cada item (as linhas vêm da mais antiga para a mais nova); capa sem caminho é ignorada. */
export function mapCapas(rows: Row[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of rows) {
    const id = row._cr40f_equipamento_value ? cleanId(str(row._cr40f_equipamento_value)) : ''
    const caminho = text(row.cr40f_caminho)
    if (id && caminho && !out.has(id)) out.set(id, caminho)
  }
  return out
}

/** Registro da foto já enviada ao SharePoint: nome, caminho do arquivo, capa e o item por @odata.bind. */
export const fotoPayload = (equipamentosSet: string, equipamentoId: string, nome: string, capa: boolean, caminho: string): Row => ({
  cr40f_name: nome, cr40f_capa: capa, cr40f_caminho: caminho, [`${NAV.fotoEquipamento}@odata.bind`]: `/${equipamentosSet}(${cleanId(equipamentoId)})`,
})

export async function loadAll(client: DataverseClient, sets: EntitySets) {
  const [equipamentos, tipos, pessoas] = await Promise.all([
    client.getAll(equipamentosPath(sets.equipamento)), client.getAll(tiposPath(sets.tipo)), client.getAll(pessoasPath(sets.funcionario)),
  ])
  return { equipamentos: equipamentos.map(mapEquipamento), tipos: tipos.map(mapTipo), pessoas: pessoas.map(mapPessoa) }
}
