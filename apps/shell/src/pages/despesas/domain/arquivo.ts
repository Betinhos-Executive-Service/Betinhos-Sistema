/** Tipo de prévia: imagem e PDF abrem no visualizador; o resto só pelo link do OneDrive. */
export type Previa = 'imagem' | 'pdf' | null

const POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
}

/** O flow devolve o Content-Type do OneDrive; quando vem genérico, a extensão decide. */
export function mimeDoArquivo(nome: string, mime: string | null | undefined) {
  const informado = (mime ?? '').split(';')[0].trim().toLowerCase()
  if (informado && informado !== 'application/octet-stream') return informado
  const ext = nome.toLowerCase().split('.').pop() ?? ''
  return POR_EXTENSAO[ext] ?? 'application/octet-stream'
}

export function tipoPrevia(mime: string): Previa {
  if (/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(mime)) return 'imagem'
  if (mime === 'application/pdf') return 'pdf'
  return null
}
