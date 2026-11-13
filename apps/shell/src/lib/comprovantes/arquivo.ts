/** Comprovante guardado no OneDrive/SharePoint; o Dataverse só tem o link (e, nos novos, o id do item). */
export type Comprovante = {
  id: string
  nome: string
  url: string | null
  driveItemId?: string
  /** Tipo informado pela origem (ex.: `cr40f_tipomidia` do recebimento); sem ele, vale a extensão do nome. */
  midia?: 'foto' | 'video' | 'pdf' | null
}

/** Conteúdo lido pelo flow, como blob URL local. */
export type Arquivo = { nome: string; mime: string; url: string }

/** Tipo de prévia: imagem, PDF e vídeo abrem no visualizador; o resto só pelo link do OneDrive. */
export type Previa = 'imagem' | 'pdf' | 'video' | null

const POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
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
  if (/^video\/(mp4|quicktime|webm)$/.test(mime)) return 'video'
  return null
}

/** Vídeo não tem miniatura: só é buscado quando o visualizador abre. */
export const ehVideo = (a: Comprovante) => (a.midia ? a.midia === 'video' : tipoPrevia(mimeDoArquivo(a.nome, null)) === 'video')
