export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const EXTENSIONS = ACCEPT.split(',')

/** Mensagem de recusa do arquivo, ou null quando ele pode ser enviado. */
export function fileProblem(file: { name: string; size: number }) {
  if (!EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) return `${file.name} não é um tipo aceito. Use PDF, DOC, DOCX, PNG ou JPG.`
  if (file.size > MAX_FILE_SIZE) return `${file.name} passa de 10 MB. Reduza o arquivo antes de enviar.`
  return null
}
