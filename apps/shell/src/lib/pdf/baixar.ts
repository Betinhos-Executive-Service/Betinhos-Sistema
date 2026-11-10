/** Baixa os bytes de um PDF com o nome dado (Blob → link temporário → revoga a URL). */
export function baixarPdf(bytes: Uint8Array, arquivo: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = arquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
