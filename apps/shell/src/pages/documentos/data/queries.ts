// data/queries.ts
import { cleanId, formatted, type Row } from '@betinhos/dataverse'
import { toDateOnly } from '../../funcionarios/data/dates'
import { parseMulti } from '../../infracoes/data/queries'
import { CATEGORIA_CODE, FUNC_DESLIGADO, SITUACAO_CODE, VEICULO_VENDIDO, categoriaDe, marcoDoCodigo, obrigDeCategoriaVeiculo, obrigDeFuncao } from '../domain/codes'
import type { Categoria, DocEmitido, Destinatario, Dono, TipoDoc } from '../domain/types'

export const ENTITIES = {
  tipo: 'cr40f_tipodocumento', documento: 'cr40f_documento', destinatario: 'cr40f_avisodestinatario',
  funcionario: 'cr40f_funcionarios', veiculo: 'cr40f_veiculos',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Navigation properties dos lookups (SchemaName criado por `provision-documentos.ps1`). */
export const NAV = { tipo: 'cr40f_Tipo', funcionario: 'cr40f_Funcionario', veiculo: 'cr40f_Veiculo' } as const

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const id = (v: unknown) => cleanId(str(v))
const sel = (campos: string[]) => campos.join(',')

export const tiposPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_tipodocumentoid', 'cr40f_codigo', 'cr40f_name', 'cr40f_categoria', 'cr40f_temvalidade', 'cr40f_validadepadraomeses', 'cr40f_obrigatoriopara', 'cr40f_ordem', 'statecode'])}`
export const documentosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_documentoid', '_cr40f_tipo_value', '_cr40f_funcionario_value', '_cr40f_veiculo_value', 'cr40f_numero', 'cr40f_emissao', 'cr40f_validade', 'cr40f_situacao', 'cr40f_pasta', 'cr40f_observacao', 'cr40f_ultimomarcoavisado', 'modifiedon'])}&$filter=${encodeURIComponent('statecode eq 0')}`
export const destinatariosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_avisodestinatarioid', 'cr40f_name', 'cr40f_categoria', '_cr40f_funcionario_value'])}&$filter=${encodeURIComponent('statecode eq 0')}`
export const funcionariosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_funcionariosid', 'new_apelido', 'cr40f_nomecompleto', 'cr40f_funcao', 'cr40f_status', 'cr40f_emailbetinhos'])}&$filter=${encodeURIComponent('statecode eq 0')}`
export const veiculosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_veiculosid', 'cr40f_placa', 'cr40f_marca', 'cr40f_modelo', 'new_categoriadoveiculo', 'cr40f_statusdoveiculo'])}&$filter=${encodeURIComponent('statecode eq 0')}`

export function mapTipo(row: Row): TipoDoc {
  return {
    id: id(row.cr40f_tipodocumentoid), codigo: str(row.cr40f_codigo).toUpperCase(), nome: str(row.cr40f_name),
    categoria: categoriaDe(row.cr40f_categoria) ?? 'pessoas', temValidade: row.cr40f_temvalidade === true,
    validadePadraoMeses: num(row.cr40f_validadepadraomeses), obrigatorioPara: parseMulti(row.cr40f_obrigatoriopara),
    ordem: num(row.cr40f_ordem) ?? 0, ativo: row.statecode !== 1,
  }
}

export function mapDoc(row: Row): DocEmitido {
  const funcionario = id(row._cr40f_funcionario_value)
  return {
    id: id(row.cr40f_documentoid), tipoId: id(row._cr40f_tipo_value),
    donoId: funcionario || id(row._cr40f_veiculo_value), categoria: funcionario ? 'pessoas' : 'frota',
    numero: str(row.cr40f_numero), emissao: toDateOnly(row.cr40f_emissao, 'DateOnly'), validade: toDateOnly(row.cr40f_validade, 'DateOnly'),
    situacao: row.cr40f_situacao === SITUACAO_CODE.substituido ? 'substituido' : 'vigente',
    pasta: str(row.cr40f_pasta), observacao: str(row.cr40f_observacao),
    ultimoMarco: marcoDoCodigo(row.cr40f_ultimomarcoavisado), modificadoEm: typeof row.modifiedon === 'string' ? row.modifiedon : null,
  }
}

export function mapDestinatario(row: Row): Destinatario {
  return { id: id(row.cr40f_avisodestinatarioid), categoria: categoriaDe(row.cr40f_categoria) ?? 'pessoas', funcionarioId: id(row._cr40f_funcionario_value), nome: str(row.cr40f_name) }
}

export function mapFuncionarioDono(row: Row): Dono {
  return {
    id: id(row.cr40f_funcionariosid), categoria: 'pessoas', nome: str(row.new_apelido) || str(row.cr40f_nomecompleto),
    detalhe: row.cr40f_funcao == null ? '' : formatted(row, 'cr40f_funcao'), obrigKey: obrigDeFuncao(row.cr40f_funcao),
    ativo: row.cr40f_status !== FUNC_DESLIGADO, email: str(row.cr40f_emailbetinhos),
  }
}

export function mapVeiculoDono(row: Row): Dono {
  return {
    id: id(row.cr40f_veiculosid), categoria: 'frota', nome: str(row.cr40f_placa),
    detalhe: [str(row.cr40f_marca), str(row.cr40f_modelo)].filter(Boolean).join(' '),
    obrigKey: obrigDeCategoriaVeiculo(row.new_categoriadoveiculo), ativo: row.cr40f_statusdoveiculo !== VEICULO_VENDIDO, email: '',
  }
}

export type NovoDoc = {
  nome: string; tipoId: string; categoria: Categoria; donoId: string
  numero: string; emissao: string | null; validade: string | null; pasta: string; observacao: string
}

const vazioNulo = (v: string) => (v.trim() ? v.trim() : null)

export function docPayload(input: NovoDoc, sets: Pick<EntitySets, 'tipo' | 'funcionario' | 'veiculo'>): Row {
  const dono = input.categoria === 'pessoas'
    ? { [`${NAV.funcionario}@odata.bind`]: `/${sets.funcionario}(${input.donoId})` }
    : { [`${NAV.veiculo}@odata.bind`]: `/${sets.veiculo}(${input.donoId})` }
  return {
    cr40f_name: input.nome, cr40f_numero: vazioNulo(input.numero), cr40f_emissao: input.emissao, cr40f_validade: input.validade,
    cr40f_situacao: SITUACAO_CODE.vigente, cr40f_pasta: input.pasta, cr40f_observacao: vazioNulo(input.observacao),
    [`${NAV.tipo}@odata.bind`]: `/${sets.tipo}(${input.tipoId})`, ...dono,
  }
}

export type TipoInput = Omit<TipoDoc, 'id' | 'ativo'>

export function tipoPayload(tipo: TipoInput): Row {
  return {
    cr40f_codigo: tipo.codigo.trim().toUpperCase(), cr40f_name: tipo.nome.trim(), cr40f_categoria: CATEGORIA_CODE[tipo.categoria],
    cr40f_temvalidade: tipo.temValidade, cr40f_validadepadraomeses: tipo.temValidade ? tipo.validadePadraoMeses : null,
    cr40f_obrigatoriopara: [...tipo.obrigatorioPara].sort((a, b) => a - b).join(',') || null, cr40f_ordem: tipo.ordem,
  }
}

export function destinatarioPayload(categoria: Categoria, funcionarioId: string, nome: string, sets: Pick<EntitySets, 'funcionario'>): Row {
  return { cr40f_name: nome, cr40f_categoria: CATEGORIA_CODE[categoria], [`${NAV.funcionario}@odata.bind`]: `/${sets.funcionario}(${funcionarioId})` }
}
