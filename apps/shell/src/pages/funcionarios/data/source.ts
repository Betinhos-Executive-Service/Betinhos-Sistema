import type { Anotacao, Documento, Draft, EquipamentoResumo, Funcionario, ImageField, Lookup, Multa, Posse } from './types'

/** Documentos do colaborador no SharePoint (flows HTTP do AppBetinhos). */
export interface DocumentStore {
  pasta(id: string): string
  listar(id: string): Promise<Documento[]>
  enviar(id: string, file: File, nome: string, subpasta?: string): Promise<Documento>
  abrir(doc: Documento): Promise<{ nome: string; blob: Blob }>
  excluir(id: string, doc: Documento): Promise<void>
}

export type NovaAnotacao = { titulo: string; texto: string; arquivo?: File | null }
export const ANEXOS_SUBPASTA = 'Anotacoes'
export type LimitesAnexo = { maxBytes: number; bloqueadas: string[] }
export const LIMITES_PADRAO: LimitesAnexo = { maxBytes: 5 * 1024 * 1024, bloqueadas: ['exe', 'bat', 'cmd', 'js', 'vbs', 'msi', 'dll', 'ps1'] }

export function validarAnexo(file: File, limites: LimitesAnexo) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (limites.bloqueadas.includes(ext)) return `Arquivos .${ext} são bloqueados pelo Dataverse.`
  if (file.size > limites.maxBytes) return `O anexo deve ter até ${Math.round(limites.maxBytes / 1024 / 1024)} MB.`
  if (file.size === 0) return 'O arquivo está vazio.'
  return null
}

export interface DataSource {
  mode: 'xrm' | 'mock'
  envLabel: string
  /** Colaboradores ativos; `onFirstPage` recebe a primeira página antes do resto. */
  list(onFirstPage?: (rows: Funcionario[]) => void): Promise<Funcionario[]>
  get(id: string): Promise<Funcionario>
  /** Grava só o diff. Retorna o id (novo ou existente). */
  save(original: Funcionario | null, draft: Draft): Promise<string>
  uploadImage(id: string, field: ImageField, file: File): Promise<void>
  /** Grava "Logins e senhas" (HTML rich text ou null). */
  saveLogins(id: string, html: string | null): Promise<void>
  multas(id: string): Promise<Multa[]>
  posses(id: string): Promise<Posse[]>
  /** Equipamentos com o funcionário, exceto os baixados. */
  equipamentos(id: string): Promise<EquipamentoResumo[]>
  anotacoes(id: string): Promise<Anotacao[]>
  addAnotacao(id: string, nota: NovaAnotacao): Promise<void>
  /** Grava título e HTML já montado (texto + links de anexo do SharePoint). */
  updateAnotacao(annotationId: string, nota: { titulo: string; notetext: string }): Promise<void>
  deleteAnotacao(annotationId: string): Promise<void>
  /** Tamanho máximo e extensões bloqueadas para anexos (configuração do ambiente). */
  limitesAnexo(): Promise<LimitesAnexo>
  /** Baixa o anexo de uma anotação (documentbody em base64). */
  anexo(annotationId: string): Promise<{ nome: string; blob: Blob }>
  documentos: DocumentStore
  searchVeiculos(query: string): Promise<Lookup[]>
  openForm(entityName: string, id?: string): void
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp']
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

export function validateImage(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use PNG, JPG, GIF ou BMP.'
  if (file.size > IMAGE_MAX_BYTES) return 'A imagem deve ter até 5 MB.'
  return null
}

export function base64ToBlob(base64: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: type || 'application/octet-stream' })
}

export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}
