/** Baixa um Blob com o nome dado (link temporário, revoga a URL depois). */
export function baixarBlob(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = arquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const baixarPdf = (bytes: Uint8Array, arquivo: string) => baixarBlob(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), arquivo)
