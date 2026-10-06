import { lerMulti } from '../domain/manutencaoCatalogo'
import { toDateOnly, type DateBehavior } from './dates'
import type { Colisao, Infracao, Manutencao, Multa, Posse, Ref, Veiculo } from './types'

export const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

type Row = Record<string, unknown>
type Behaviors = Record<string, DateBehavior>

export const SELECT = {
  veiculos: ['cr40f_veiculosid', 'cr40f_placa', 'cr40f_marca', 'cr40f_modelo', 'cr40f_cor', 'cr40f_anodemodelo', 'cr40f_statusdoveiculo', 'new_categoriadoveiculo', '_cr40f_motoristaatual_value'],
  manutencoes: ['cr40f_manutencoesid', 'cr40f_id', 'cr40f_descricao', 'cr40f_status', 'cr40f_graudamanutencao', 'cr40f_tipodoreparo', 'cr40f_agendarpara', 'cr40f_datamanutencao', 'cr40f_valor', 'cr40f_estabelecimento', 'cr40f_servicorealizado', 'cr40f_comentariosdoaprovador', 'cr40f_kmatual', '_cr40f_placa_carro_value', '_cr40f_solicitado_por_value', 'createdon', 'new_servicosmanutencao', 'new_categoriasmanutencao', 'new_classificacaoorigem', 'new_confiancaia'],
  multas: ['cr40f_multasid', 'cr40f_novacoluna', 'cr40f_status', 'cr40f_dataehorario', 'cr40f_localdainfracao', 'cr40f_dataparaindicar', 'cr40f_indicado', 'cr40f_datadeavisoaocondutor', 'cr40f_datadeindicacao', '_cr40f_placa_value', '_cr40f_motorista_value', '_cr40f_codigodainfracao_value', 'createdon'],
  infracoes: ['cr40f_infracaodetransitoid', 'cr40f_codigodainfracao', 'cr40f_descricaodainfracao', 'cr40f_gravidadedainfracao', 'cr40f_pontosnacnh', 'cr40f_valordamulta'],
  colisoes: ['cr40f_colisao_v2id', 'cr40f_name', 'cr40f_datahora', 'cr40f_local', 'cr40f_descricao', 'cr40f_statusoperacional', 'cr40f_tipoocorrencia', 'cr40f_houveterceiro', '_cr40f_veiculo_value', '_cr40f_motorista_value', 'createdon'],
  posses: ['new_possedeveiculoid', 'new_iniciodaposse', 'new_fimdaposse', '_new_veiculo_value', '_new_motorista_value'],
} as const

export function cleanId(value: unknown) {
  return String(value).replace(/[{}]/g, '').toLowerCase()
}

const str = (value: unknown) => (typeof value === 'string' && value ? value : null)
const num = (value: unknown) => (typeof value === 'number' ? value : null)

export function ref(row: Row, key: string): Ref | null {
  const id = row[key]
  return typeof id === 'string' && id ? { id: cleanId(id), label: String(row[`${key}${FORMATTED}`] ?? '') } : null
}

export function mapVeiculo(row: Row): Veiculo {
  return {
    id: cleanId(row.cr40f_veiculosid),
    placa: String(row.cr40f_placa ?? ''),
    marca: str(row.cr40f_marca),
    modelo: str(row.cr40f_modelo),
    cor: str(row.cr40f_cor),
    anoModelo: num(row.cr40f_anodemodelo),
    status: num(row.cr40f_statusdoveiculo),
    categoria: num(row.new_categoriadoveiculo),
    motorista: ref(row, '_cr40f_motoristaatual_value'),
  }
}

export function mapManutencao(row: Row, behaviors: Behaviors = {}): Manutencao {
  return {
    id: cleanId(row.cr40f_manutencoesid),
    codigo: String(row.cr40f_id ?? ''),
    descricao: String(row.cr40f_descricao ?? ''),
    status: num(row.cr40f_status),
    grau: num(row.cr40f_graudamanutencao),
    tipo: num(row.cr40f_tipodoreparo),
    agendarPara: toDateOnly(row.cr40f_agendarpara, behaviors.cr40f_agendarpara),
    dataManutencao: str(row.cr40f_datamanutencao),
    valor: num(row.cr40f_valor),
    estabelecimento: str(row.cr40f_estabelecimento),
    servicoRealizado: str(row.cr40f_servicorealizado),
    comentarioAprovador: str(row.cr40f_comentariosdoaprovador),
    km: num(row.cr40f_kmatual),
    veiculo: ref(row, '_cr40f_placa_carro_value'),
    solicitante: ref(row, '_cr40f_solicitado_por_value'),
    criadoEm: String(row.createdon ?? ''),
    servicos: lerMulti(row.new_servicosmanutencao),
    categorias: lerMulti(row.new_categoriasmanutencao),
    origemClassificacao: num(row.new_classificacaoorigem),
    confiancaIa: num(row.new_confiancaia),
  }
}

export function mapMulta(row: Row, behaviors: Behaviors = {}): Multa {
  return {
    id: cleanId(row.cr40f_multasid),
    titulo: String(row.cr40f_novacoluna ?? 'Multa'),
    status: num(row.cr40f_status),
    dataHora: str(row.cr40f_dataehorario),
    local: str(row.cr40f_localdainfracao),
    dataParaIndicar: toDateOnly(row.cr40f_dataparaindicar, behaviors.cr40f_dataparaindicar),
    indicado: row.cr40f_indicado === true,
    dataAviso: toDateOnly(row.cr40f_datadeavisoaocondutor, behaviors.cr40f_datadeavisoaocondutor),
    dataIndicacao: toDateOnly(row.cr40f_datadeindicacao, behaviors.cr40f_datadeindicacao),
    veiculo: ref(row, '_cr40f_placa_value'),
    motorista: ref(row, '_cr40f_motorista_value'),
    infracaoId: ref(row, '_cr40f_codigodainfracao_value')?.id ?? null,
    criadoEm: String(row.createdon ?? ''),
  }
}

export function mapInfracao(row: Row): Infracao {
  return {
    id: cleanId(row.cr40f_infracaodetransitoid),
    codigo: String(row.cr40f_codigodainfracao ?? ''),
    descricao: str(row.cr40f_descricaodainfracao),
    gravidade: num(row.cr40f_gravidadedainfracao),
    pontos: num(row.cr40f_pontosnacnh),
    valor: num(row.cr40f_valordamulta),
  }
}

export function mapColisao(row: Row): Colisao {
  return {
    id: cleanId(row.cr40f_colisao_v2id),
    titulo: String(row.cr40f_name ?? 'Colisão'),
    status: num(row.cr40f_statusoperacional),
    tipo: num(row.cr40f_tipoocorrencia),
    dataHora: str(row.cr40f_datahora),
    local: str(row.cr40f_local),
    descricao: str(row.cr40f_descricao),
    houveTerceiro: row.cr40f_houveterceiro === true,
    veiculo: ref(row, '_cr40f_veiculo_value'),
    motorista: ref(row, '_cr40f_motorista_value'),
    criadoEm: String(row.createdon ?? ''),
  }
}

export function mapPosse(row: Row): Posse {
  return {
    id: cleanId(row.new_possedeveiculoid),
    inicio: str(row.new_iniciodaposse),
    fim: str(row.new_fimdaposse),
    veiculo: ref(row, '_new_veiculo_value'),
    motorista: ref(row, '_new_motorista_value'),
  }
}
