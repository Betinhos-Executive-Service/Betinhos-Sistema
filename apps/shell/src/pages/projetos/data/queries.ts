import { cleanId, type Row } from '@betinhos/dataverse'
import type { Anexo, Atualizacao, Projeto } from '../domain/types'
import { AUTOR } from '../domain/choices'

export const ENTITIES = { projeto: 'cr40f_projeto', atualizacao: 'cr40f_projetoatualizacao' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Propriedade de navegação do lookup (SchemaName criado pela migration 20261123-0845-projetos.ps1). */
export const NAV_PROJETO = 'cr40f_Projeto'
/** Anexos (notas) da atualização: coleção da relação padrão annotation → tabela. */
export const NAV_ANEXOS = 'cr40f_projetoatualizacao_Annotations'

const PROJETO_SELECT = [
  'cr40f_projetoid', 'cr40f_name', 'cr40f_area', 'cr40f_status', 'cr40f_responsavel', 'cr40f_prazo', 'cr40f_andamento', 'cr40f_linkpr', 'cr40f_instrucoes',
]
const ATUALIZACAO_SELECT = ['cr40f_projetoatualizacaoid', '_cr40f_projeto_value', 'cr40f_data', 'cr40f_autor', 'cr40f_texto', 'cr40f_eprova', 'createdon']

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const text = (v: unknown) => { const t = str(v).trim(); return /^(null|undefined)$/i.test(t) ? '' : t }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const projetosPath = (set: string) => `${set}?$select=${PROJETO_SELECT.join(',')}&$orderby=${encodeURIComponent('cr40f_name asc')}`
/** Sem o corpo dos arquivos: só nome, tipo e tamanho; o conteúdo vem sob demanda (`anexoPath`). */
export const atualizacoesPath = (set: string) =>
  `${set}?$select=${ATUALIZACAO_SELECT.join(',')}&$expand=${NAV_ANEXOS}($select=annotationid,filename,mimetype,filesize;$filter=isdocument eq true)&$orderby=${encodeURIComponent('cr40f_data desc')}`
export const anexoPath = (id: string) => `annotations(${cleanId(id)})?$select=documentbody,mimetype,filename`

export const mapProjeto = (row: Row): Projeto => ({
  id: cleanId(str(row.cr40f_projetoid)), nome: text(row.cr40f_name), area: text(row.cr40f_area), status: num(row.cr40f_status),
  responsavel: text(row.cr40f_responsavel), prazo: text(row.cr40f_prazo).slice(0, 10) || null,
  andamento: Math.min(100, Math.max(0, num(row.cr40f_andamento) ?? 0)), linkPr: text(row.cr40f_linkpr), instrucoes: str(row.cr40f_instrucoes),
})

export const mapAnexo = (row: Row): Anexo => ({ id: cleanId(str(row.annotationid)), nome: text(row.filename) || 'arquivo', tipo: text(row.mimetype), tamanho: num(row.filesize) })

export function mapAtualizacao(row: Row): Atualizacao {
  const anexos = Array.isArray(row[NAV_ANEXOS]) ? (row[NAV_ANEXOS] as Row[]).map(mapAnexo) : []
  return {
    id: cleanId(str(row.cr40f_projetoatualizacaoid)), projetoId: cleanId(str(row._cr40f_projeto_value)),
    data: text(row.cr40f_data) || text(row.createdon), autor: num(row.cr40f_autor) ?? AUTOR.agente, texto: str(row.cr40f_texto),
    prova: row.cr40f_eprova === true, anexos,
  }
}

/** Para o rótulo do resumo (primeiros caracteres do texto) gravado como nome da atualização. */
export const resumo = (texto: string) => (texto.trim().replace(/\s+/g, ' ').slice(0, 100) || 'Atualização')

export const atualizacaoPayload = (a: { projetoId: string; data: string; autor: number; texto: string; prova: boolean }, sets: EntitySets): Row => ({
  cr40f_name: resumo(a.texto), cr40f_data: a.data, cr40f_autor: a.autor, cr40f_texto: a.texto, cr40f_eprova: a.prova,
  [`${NAV_PROJETO}@odata.bind`]: `/${sets.projeto}(${cleanId(a.projetoId)})`,
})

export const anexoPayload = (atualizacaoSet: string, atualizacaoId: string, nome: string, tipo: string, base64: string): Row => ({
  subject: nome, filename: nome, mimetype: tipo, isdocument: true, documentbody: base64,
  [`objectid_${ENTITIES.atualizacao}@odata.bind`]: `/${atualizacaoSet}(${cleanId(atualizacaoId)})`,
})

