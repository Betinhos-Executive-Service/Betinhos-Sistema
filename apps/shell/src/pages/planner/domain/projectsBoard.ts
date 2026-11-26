// Quadro de Projetos do Planner: projetos do cr40f_projeto (pasta planner/projetos), em colunas por situação.
import { STATUS, STATUS_OPTIONS } from '../projetos/domain/choices'
import { MAX_ANEXOS, erroDoAnexo } from '../projetos/domain/anexos'
import { etapaDoProjeto } from '../projetos/domain/regras'
import type { Anexo, Atualizacao, Etapa, Projeto } from '../projetos/domain/types'

export const BOARD_COLUMNS = STATUS_OPTIONS

export type ProjectCard = {
  projeto: Projeto
  etapa: Etapa | null
  status: number
  /** Todos os anexos do projeto (briefing e atualizações), do mais recente ao mais antigo. */
  anexos: Anexo[]
  ultimaData: string
}

/** Um cartão por projeto; projeto sem etapa fica em Ideia. Mais recentes primeiro. */
export function projectCards(projetos: Projeto[], etapas: Etapa[], atualizacoes: Atualizacao[]): ProjectCard[] {
  return projetos.map((projeto) => {
    const etapa = etapaDoProjeto(etapas, projeto.id)
    const doProjeto = atualizacoes.filter((a) => a.projetoId === projeto.id).sort((a, b) => b.data.localeCompare(a.data))
    return {
      projeto,
      etapa,
      status: etapa?.status ?? STATUS.ideia,
      anexos: doProjeto.flatMap((a) => a.anexos),
      ultimaData: doProjeto[0]?.data ?? '',
    }
  }).sort((a, b) => b.ultimaData.localeCompare(a.ultimaData) || b.projeto.codigo.localeCompare(a.projeto.codigo, 'pt-BR', { numeric: true }))
}

export function cardsByStatus(cards: ProjectCard[]): Map<number, ProjectCard[]> {
  const map = new Map<number, ProjectCard[]>(BOARD_COLUMNS.map((c) => [c.value, []]))
  for (const card of cards) (map.get(card.status) ?? map.get(STATUS.ideia)!).push(card)
  return map
}

export type AttachmentKind = 'audio' | 'image' | 'video' | 'file'
export function attachmentKind(type: string): AttachmentKind {
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  return 'file'
}

/** Nome legível para arquivo colado (o navegador chama todo print de `image.png`). */
export function namePastedFile(file: File, now = new Date()): File {
  if (file.name && file.name !== 'image.png' && file.name !== 'blob') return file
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  const ext = (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').split(';')[0]
  return new File([file], `colado-${stamp}.${ext}`, { type: file.type, lastModified: now.getTime() })
}

/** Separa os arquivos aceitos dos recusados (tipo, tamanho, vazio e limite de quantidade). */
export function acceptFiles(current: File[], incoming: File[]): { accepted: File[]; errors: string[] } {
  const accepted: File[] = []
  const errors: string[] = []
  for (const file of incoming) {
    const erro = erroDoAnexo(file)
    if (erro) { errors.push(erro); continue }
    if (current.length + accepted.length >= MAX_ANEXOS) { errors.push(`Até ${MAX_ANEXOS} anexos por vez; ${file.name} ficou de fora.`); continue }
    accepted.push(file)
  }
  return { accepted, errors }
}
