/** Limite de cada anexo: o Dataverse recusa arquivo de nota acima de 5 MB (padrão do ambiente). */
export const MAX_ANEXO_BYTES = 5 * 1024 * 1024
export const MAX_ANEXOS = 10

const mb = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export const ehImagem = (tipo: string) => tipo.startsWith('image/')
export const ehVideo = (tipo: string) => tipo.startsWith('video/')
export const ehAudio = (tipo: string) => tipo.startsWith('audio/')

/** Imagem, vídeo, áudio ou PDF até o limite; devolve a mensagem do problema (null = aceito). */
export function erroDoAnexo(file: { name: string; type: string; size: number }): string | null {
  if (!ehImagem(file.type) && !ehVideo(file.type) && !ehAudio(file.type) && file.type !== 'application/pdf') {
    return `${file.name}: só imagem, vídeo, áudio ou PDF.`
  }
  if (file.size > MAX_ANEXO_BYTES) {
    return `${file.name} tem ${mb(file.size)} MB e passa do limite de ${mb(MAX_ANEXO_BYTES)} MB por arquivo. Reduza o arquivo (vídeo curto ou print) e envie de novo.`
  }
  if (file.size === 0) return `${file.name}: arquivo vazio.`
  return null
}
