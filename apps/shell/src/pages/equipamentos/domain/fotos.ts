import { IMAGE_TYPES, validateImage } from '../../funcionarios/data/source'

/** Foto de um equipamento (`cr40f_fotoequipamento`), como os anexos do Planner; uma por item é a capa. */
export type Foto = {
  id: string
  equipamentoId: string
  /** Nome do arquivo enviado. */
  nome: string
  capa: boolean
  criadoEm: Date | null
  /** Miniatura (data URL); null se o Dataverse não devolveu imagem. */
  miniatura: string | null
  /** Imagem grande (`$value?size=full`); null = só a miniatura. */
  url: string | null
}

/** Mesmos tipos e limite da foto do funcionário (PNG, JPG, GIF ou BMP até 5 MB; o Dataverse só aceita esses). */
export const FOTO_TYPES = IMAGE_TYPES
export const validarFoto = (file: File) => validateImage(file)

/** Nome gravado em `cr40f_name` (200): imagem colada vem sem nome ou como "image.png". */
export const MAX_NOME_FOTO = 200
export function nomeFoto(file: File, agora = new Date()): string {
  const nome = file.name.trim()
  if (nome && !/^image\.\w+$/i.test(nome)) return nome.slice(0, MAX_NOME_FOTO)
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const p = (n: number) => String(n).padStart(2, '0')
  return `Foto colada ${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())} ${p(agora.getHours())}h${p(agora.getMinutes())}m${p(agora.getSeconds())}s.${ext}`
}

const tempo = (f: Foto) => f.criadoEm?.getTime() ?? Number.MAX_SAFE_INTEGER

/** Mais antiga primeiro (ordem de envio); empate pelo id para a ordem não pular entre cargas. */
export function ordenarFotos(fotos: Foto[]): Foto[] {
  return [...fotos].sort((a, b) => tempo(a) - tempo(b) || a.id.localeCompare(b.id))
}

/**
 * A capa do item: a mais antiga marcada; sem nenhuma marcada (gravado fora do shell), a mais antiga.
 * Vale também para mais de uma marcada, o que o shell nunca grava.
 */
export function capaEfetiva(fotos: Foto[]): Foto | null {
  const ordem = ordenarFotos(fotos)
  return ordem.find((f) => f.capa) ?? ordem[0] ?? null
}

/** Miniatura que a lista mostra: a da capa marcada mais antiga, como a consulta de capas do Dataverse; null = ícone do tipo. */
export const miniaturaDaCapa = (fotos: Foto[]) => capaEfetiva(fotos.filter((f) => f.capa))?.miniatura ?? null

/** A primeira foto do item vira capa. */
export const nasceCapa = (fotos: Foto[]) => fotos.length === 0

export type AjusteCapa = { id: string; capa: boolean }

/**
 * Marcações para deixar só `capaId` como capa. A nova vem antes das desmarcações: se uma gravação falhar no meio,
 * o item fica com duas capas (a lista mostra a mais antiga) e nunca sem nenhuma.
 */
export function ajustesCapa(fotos: Foto[], capaId: string | null): AjusteCapa[] {
  const out: AjusteCapa[] = []
  const nova = capaId ? fotos.find((f) => f.id === capaId) : undefined
  if (nova && !nova.capa) out.push({ id: nova.id, capa: true })
  for (const f of ordenarFotos(fotos)) if (f.capa && f.id !== nova?.id) out.push({ id: f.id, capa: false })
  return out
}

/** Excluir a capa promove a mais antiga restante; excluir outra foto não muda a capa. */
export function ajustesAoExcluir(fotos: Foto[], excluidaId: string): AjusteCapa[] {
  const restantes = fotos.filter((f) => f.id !== excluidaId)
  return ajustesCapa(restantes, capaEfetiva(restantes)?.id ?? null)
}

export const aplicarAjustes = (fotos: Foto[], ajustes: AjusteCapa[]): Foto[] => {
  const porId = new Map(ajustes.map((a) => [a.id, a.capa]))
  return fotos.map((f) => (porId.has(f.id) ? { ...f, capa: porId.get(f.id)! } : f))
}

/**
 * Arquivos de imagem de um Ctrl+V; null quando o colar é de texto e deve ir para o campo em foco
 * (um campo de texto com texto no clipboard nunca vira foto, mesmo se o clipboard também tiver imagem).
 */
export function arquivosColados(data: DataTransfer | null, alvoEditavel: boolean): File[] | null {
  if (!data) return null
  const files = Array.from(data.items ?? []).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((f): f is File => Boolean(f))
  if (!files.length) return null
  if (alvoEditavel && Array.from(data.types ?? []).includes('text/plain')) return null
  return files
}

/** Campo onde o Ctrl+V cola texto: input de texto, textarea ou contenteditable. */
export function editavel(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color'].includes(el.type)
}
