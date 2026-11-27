import { cleanId, type Row } from '@betinhos/dataverse'
import type { Anexo, Atualizacao, Etapa, Projeto } from '../domain/types'
import { AUTOR, STATUS } from '../domain/choices'
import { lerChecklist } from '../domain/checklist'
import { lerPrazo } from '../domain/prazo'

export const ENTITIES = { projeto: 'cr40f_projeto', etapa: 'cr40f_projetoetapa', atualizacao: 'cr40f_projetoatualizacao' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Propriedades de navegação dos lookups (SchemaName criado pela migration 20261123-0845-projetos.ps1). */
export const NAV_PROJETO = 'cr40f_Projeto'
export const NAV_ETAPA = 'cr40f_Etapa'
/** Anexos (notas) da atualização: coleção da relação padrão annotation → tabela. */
export const NAV_ANEXOS = 'cr40f_projetoatualizacao_Annotations'

const PROJETO_SELECT = ['cr40f_projetoid', 'cr40f_codigo', 'cr40f_name', 'cr40f_briefing', 'cr40f_checklist', 'cr40f_prazo', 'cr40f_prazotipo']
const ETAPA_SELECT = [
  'cr40f_projetoetapaid', '_cr40f_projeto_value', 'cr40f_numero', 'cr40f_codigo', 'cr40f_name', 'cr40f_status',
  'cr40f_prazo', 'cr40f_andamento', 'cr40f_linkpr', 'cr40f_publicadoprod', 'cr40f_motivopausa',
]
const ATUALIZACAO_SELECT = [
  'cr40f_projetoatualizacaoid', '_cr40f_projeto_value', '_cr40f_etapa_value', 'cr40f_data', 'cr40f_autor', 'cr40f_texto', 'cr40f_eprova', 'cr40f_transcricao', 'createdon',
]

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const text = (v: unknown) => { const t = str(v).trim(); return /^(null|undefined)$/i.test(t) ? '' : t }

const SP = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
/** Data e hora do Dataverse (UTC, `…Z`) → horário de São Paulo sem fuso (`aaaa-mm-ddTHH:mm:ss`), a convenção da tela. Sem fuso fica como veio. */
export const localIso = (v: string) => (v && /(Z|[+-]\d{2}:?\d{2})$/.test(v) ? SP.format(new Date(v)).replace(' ', 'T') : v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const projetosPath = (set: string) => `${set}?$select=${PROJETO_SELECT.join(',')}&$orderby=${encodeURIComponent('cr40f_name asc')}`
export const projetoCodigoPath = (set: string, id: string) => `${set}(${cleanId(id)})?$select=cr40f_codigo`
export const etapasPath = (set: string) => `${set}?$select=${ETAPA_SELECT.join(',')}&$orderby=${encodeURIComponent('cr40f_numero asc')}`
/** Sem o corpo dos arquivos: só nome, tipo e tamanho; o conteúdo vem sob demanda (`anexoPath`). */
export const atualizacoesPath = (set: string) =>
  `${set}?$select=${ATUALIZACAO_SELECT.join(',')}&$expand=${NAV_ANEXOS}($select=annotationid,filename,mimetype,filesize;$filter=isdocument eq true)&$orderby=${encodeURIComponent('cr40f_data desc')}`
export const anexoPath = (id: string) => `annotations(${cleanId(id)})?$select=documentbody,mimetype,filename`

export const mapProjeto = (row: Row): Projeto => ({
  id: cleanId(str(row.cr40f_projetoid)), codigo: text(row.cr40f_codigo), nome: text(row.cr40f_name), briefing: str(row.cr40f_briefing),
  checklist: lerChecklist(row.cr40f_checklist), prazo: lerPrazo(row.cr40f_prazo, row.cr40f_prazotipo),
})

export const mapEtapa = (row: Row): Etapa => ({
  id: cleanId(str(row.cr40f_projetoetapaid)), projetoId: cleanId(str(row._cr40f_projeto_value)), numero: num(row.cr40f_numero) ?? 0,
  codigo: text(row.cr40f_codigo), nome: text(row.cr40f_name), status: num(row.cr40f_status) ?? STATUS.ideia,
  prazo: text(row.cr40f_prazo).slice(0, 10) || null, andamento: Math.min(100, Math.max(0, num(row.cr40f_andamento) ?? 0)),
  linkPr: text(row.cr40f_linkpr), publicadoProd: localIso(text(row.cr40f_publicadoprod)) || null,
  motivoPausa: text(row.cr40f_motivopausa),
})

export const mapAnexo = (row: Row): Anexo => ({ id: cleanId(str(row.annotationid)), nome: text(row.filename) || 'arquivo', tipo: text(row.mimetype), tamanho: num(row.filesize) })

export function mapAtualizacao(row: Row): Atualizacao {
  const anexos = Array.isArray(row[NAV_ANEXOS]) ? (row[NAV_ANEXOS] as Row[]).map(mapAnexo) : []
  const etapa = text(row._cr40f_etapa_value)
  return {
    id: cleanId(str(row.cr40f_projetoatualizacaoid)), projetoId: cleanId(str(row._cr40f_projeto_value)), etapaId: etapa ? cleanId(etapa) : null,
    data: localIso(text(row.cr40f_data) || text(row.createdon)), autor: num(row.cr40f_autor) ?? AUTOR.agente, texto: str(row.cr40f_texto),
    prova: row.cr40f_eprova === true, transcricao: str(row.cr40f_transcricao).trim(), anexos,
  }
}

/** Para o rótulo do resumo (primeiros caracteres do texto) gravado como nome da atualização. */
export const resumo = (texto: string) => (texto.trim().replace(/\s+/g, ' ').slice(0, 100) || 'Atualização')

export type NovaAtualizacaoDados = { projetoId: string; etapaId: string | null; data: string; autor: number; texto: string; prova: boolean }

export const atualizacaoPayload = (a: NovaAtualizacaoDados, sets: EntitySets): Row => ({
  cr40f_name: resumo(a.texto), cr40f_data: new Date(a.data).toISOString(), cr40f_autor: a.autor, cr40f_texto: a.texto, cr40f_eprova: a.prova,
  [`${NAV_PROJETO}@odata.bind`]: `/${sets.projeto}(${cleanId(a.projetoId)})`,
  ...(a.etapaId ? { [`${NAV_ETAPA}@odata.bind`]: `/${sets.etapa}(${cleanId(a.etapaId)})` } : {}),
})

/** Etapa nova: colunas do formulário mais projeto, número e código calculados na tela. */
export const etapaPayload = (changes: Row, nova: { projetoId: string; numero: number; codigo: string }, sets: EntitySets): Row => ({
  ...changes, cr40f_numero: nova.numero, cr40f_codigo: nova.codigo,
  [`${NAV_PROJETO}@odata.bind`]: `/${sets.projeto}(${cleanId(nova.projetoId)})`,
})

export const anexoPayload = (atualizacaoSet: string, atualizacaoId: string, nome: string, tipo: string, base64: string): Row => ({
  subject: nome, filename: nome, mimetype: tipo, isdocument: true, documentbody: base64,
  [`objectid_${ENTITIES.atualizacao}@odata.bind`]: `/${atualizacaoSet}(${cleanId(atualizacaoId)})`,
})

// Papéis do Renan (administrador do ambiente) e leitura dos papéis do usuário: `app/papeisUsuario.ts`, comum a outras telas.
export { PAPEIS_RENAN, papeisPath } from '../../../../app/papeisUsuario'
